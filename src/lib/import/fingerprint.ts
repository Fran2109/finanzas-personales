import { createHash } from "node:crypto";

import { normalizeMerchant } from "../domain.ts";
import type { Currency, Kind } from "../domain.ts";
import type { Cents } from "../money.ts";

/** Lo minimo que identifica un movimiento ya listo para escribir. */
export type Fingerprintable = {
  accountId: string;
  occurredOn: string;
  /** El monto tal como se va a guardar, ya normalizado por kind. */
  amount: Cents;
  currency: Currency;
  description: string;
  cardLast4: string | null;
  cuotaCurrent: number | null;
  kind?: Kind;
};

/**
 * Huella anti-duplicados.
 *
 * Con el indice unico parcial sobre (user_id, fingerprint), subir el mismo
 * resumen dos veces lo rechaza la base, no el codigo.
 *
 * Incluye el numero de cuota porque sin el la red se pasa de celosa: la cuota
 * 1/3 y la 2/3 de la misma compra comparten fecha, monto y descripcion (el
 * "01/03" se limpia), asi que la segunda parecia un duplicado de la primera y
 * el resumen del mes siguiente se rechazaba entero. Son dos salidas de caja
 * distintas.
 *
 * Incluye la cuenta porque el mismo consumo en dos tarjetas son dos
 * movimientos reales, no uno repetido.
 *
 * Se calcula sobre el monto ya normalizado, el mismo que queda guardado, para
 * que la huella se pueda recomputar desde la fila sin volver al resumen.
 */
export function fingerprintOf(row: Fingerprintable, seq: number): string {
  return createHash("sha256").update(keyOf(row).concat("|", String(seq))).digest("hex").slice(0, 32);
}

/**
 * Los campos que definen la huella, como texto comparable.
 *
 * Se exporta para poder preguntar "¿esta edicion toca la huella?" sin repetir
 * la lista en otro lado y que se desincronice. Editar la categoria o el tipo no
 * la toca; editar el monto o la fecha si.
 */
export function fingerprintKey(row: Fingerprintable): string {
  return keyOf(row);
}

function keyOf(row: Fingerprintable): string {
  return [
    row.accountId,
    row.occurredOn,
    String(row.amount),
    row.currency,
    normalizeMerchant(row.description),
    row.cardLast4 ?? "",
    // Solo el numero de cuota, no el total: transactions no guarda el total,
    // y asi la huella se puede recomputar desde la fila guardada.
    row.cuotaCurrent ? String(row.cuotaCurrent) : "",
  ].join("|");
}

/**
 * Asigna a cada fila su huella, numerando los repetidos.
 *
 * El `seq` distingue dos movimientos realmente identicos dentro del mismo
 * resumen (dos peajes iguales el mismo dia). Es estable: el mismo resumen
 * parseado de nuevo da el mismo orden, asi que la deteccion entre resumenes
 * distintos se mantiene.
 */
export function withFingerprints<T extends Fingerprintable>(
  rows: T[],
): (T & { fingerprint: string })[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = keyOf(row);
    const seq = seen.get(key) ?? 0;
    seen.set(key, seq + 1);
    return { ...row, fingerprint: fingerprintOf(row, seq) };
  });
}
