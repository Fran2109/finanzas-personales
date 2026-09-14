import { createHash } from "node:crypto";

import { normalizeMerchant } from "../domain.ts";
import type { ParsedRow } from "./types.ts";

/**
 * Huella anti-duplicados.
 *
 * Se calcula sobre fecha + monto + moneda + descripcion normalizada + plastico.
 * Con el indice unico parcial sobre (user_id, fingerprint), subir el mismo
 * resumen dos veces lo rechaza la base, no el codigo.
 *
 * El `seq` distingue dos movimientos realmente identicos dentro del mismo
 * resumen (dos peajes iguales el mismo dia). Es estable: el mismo resumen
 * parseado de nuevo da el mismo orden, asi que la deteccion entre resumenes
 * distintos se mantiene.
 */
export function fingerprintOf(row: ParsedRow, seq: number): string {
  const parts = [
    row.occurredOn,
    String(row.amount),
    row.currency,
    normalizeMerchant(row.rawDescription),
    row.cardLast4 ?? "",
    String(seq),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

/** Asigna a cada fila su huella, numerando los repetidos. */
export function withFingerprints(rows: ParsedRow[]): (ParsedRow & { fingerprint: string })[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = [
      row.occurredOn,
      row.amount,
      row.currency,
      normalizeMerchant(row.rawDescription),
      row.cardLast4 ?? "",
    ].join("|");
    const seq = seen.get(key) ?? 0;
    seen.set(key, seq + 1);
    return { ...row, fingerprint: fingerprintOf(row, seq) };
  });
}
