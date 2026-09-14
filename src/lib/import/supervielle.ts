/**
 * Lector de resumenes de tarjeta Supervielle (VISA y MASTERCARD).
 *
 * Comparte objetivo con el de Galicia pero no comparte casi nada de formato:
 * las fechas vienen en ISO, el total se llama SALDO ACTUAL en vez de TOTAL A
 * PAGAR, el comprobante va antes de la descripcion en vez de despues, y las
 * cuotas se marcan "C.04/12" o "04/12". Por eso es un parser propio: meter los
 * dos en uno solo habria dejado una maraña de ramas donde cualquier cambio de
 * un banco rompe el otro.
 */
import { parseAmountToCents, type Cents } from "../money.ts";
import type { Currency, Kind } from "../domain.ts";
import type { CardSubtotal, ParsedRow, ParsedStatement } from "./types.ts";

const MONEY = /-?[\d.]*\d,\d{2}/g;
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/;

/**
 * El PDF de Supervielle mete un espacio despues de cada "S": "IMPUES TO DE S
 * ELLOS", "FRANCIS CO", "MAS TERCARD". Es sistematico, no aleatorio, asi que se
 * repara antes de parsear.
 *
 * El costo es que un nombre con una palabra terminada en S se pega a la
 * siguiente ("TRES MARIAS" quedaria "TRESMARIAS"). Es un defecto cosmetico y
 * estable: la misma descripcion sale igual todos los meses, asi que las reglas
 * de comercio siguen funcionando. Lo contrario es peor: sin reparar, el patron
 * de "MERPAGO*S OLUCIONES" queda en "MERPAGO S" y agrupa comercios distintos.
 */
function repairSpacing(line: string): string {
  return line.replace(/S (?=[A-ZÁÉÍÓÚÑ])/g, "S");
}

/** Lineas de estructura y totales: tienen montos pero no son movimientos. */
const STRUCTURAL =
  /^(NRO DE CUENTA|CARTERA|LIQ\.|FECHA |TARJETA\s+\d+|TOTAL TITULAR|DEBITAREMOS|Debitaremos|VISA\s*:|MASTERCARD\s*:|SUCURSAL|GRUPO|CUIT|TITULAR|DIRECC|TNA|LIMITE|Movimientos|SALDO |PAGO MINIMO|Cuotas a vencer|[A-Z][a-z]+[/-]\d{2}\s)/i;

/** Lo que el resumen trae pero la app no registra. */
const NOT_TRACKED = /\bSU PAGO\b|\bPAGO MINIMO\b|\bDEV\.?\s?(IMP|PER)\b/i;

const NOT_CONSUMPTION: ReadonlyArray<{ test: RegExp; kind: Kind }> = [
  { test: /\bSU PAGO\b|\bPAGO MINIMO\b/i, kind: "payment" },
  { test: /\bIVA\b|\bIIBB\b|\bSELLOS\b|\bRG\s*\d{4}\b|\bPERCEP/i, kind: "tax_fee" },
  { test: /\bINTERESES\b|\bREFINANC|\bPUNITORIO/i, kind: "financing" },
  { test: /\bDEV\.?\s?(IMP|PER)\b|\bDEVOLUCION\b/i, kind: "refund" },
];

function classify(description: string, amount: Cents): Kind {
  for (const { test, kind } of NOT_CONSUMPTION) {
    if (test.test(description)) return kind;
  }
  return amount < 0 ? "refund" : "consumption";
}

function moneyTokens(line: string): string[] {
  return line.match(MONEY) ?? [];
}

/**
 * Monto y moneda de una fila.
 *
 * Las filas traen las dos columnas, pesos y dolares, y una de las dos en cero.
 * Si se tomara el ultimo monto de la linea —como en Galicia— toda fila con las
 * dos columnas se leeria como 0,00.
 */
function readAmount(rest: string): { amount: Cents; currency: Currency } | null {
  const money = moneyTokens(rest);
  if (money.length === 0) return null;

  if (money.length === 1) {
    const amount = parseAmountToCents(money[0]);
    return amount === null ? null : { amount, currency: "ARS" };
  }

  const ars = parseAmountToCents(money[money.length - 2]);
  const usd = parseAmountToCents(money[money.length - 1]);
  if (ars === null || usd === null) return null;
  return usd !== 0 ? { amount: usd, currency: "USD" } : { amount: ars, currency: "ARS" };
}

function cleanDescription(rest: string, lastMoney: string): string {
  const cut = rest.lastIndexOf(lastMoney);
  let out = cut > 0 ? rest.slice(0, cut) : rest;

  // El comprobante y el codigo de operacion van ADELANTE, al reves que en
  // Galicia: se pelan los numeros sueltos del principio.
  for (let i = 0; i < 3; i++) {
    const shorter = out.replace(/^\s*\d+\s+/, "");
    if (shorter === out) break;
    out = shorter;
  }

  return out
    .replace(/\s*-?[\d.]*\d,\d{2}\s*$/, "") // la otra columna, si quedo
    .replace(/\bC?\.?\d{2}\/\d{2}\b/, "")   // marca de cuota, se guarda aparte
    .replace(/\s*\$\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCuota(rest: string): { current: number | null; total: number | null } {
  const nn = rest.match(/\b(\d{2})\/(\d{2})\b/);
  return nn
    ? { current: Number(nn[1]), total: Number(nn[2]) }
    : { current: null, total: null };
}

export function parseSupervielleStatement(text: string): ParsedStatement {
  const lines = text
    .split("\n")
    .map((l) => repairSpacing(l.replace(/\s+/g, " ").trim()))
    .filter(Boolean);

  const rows: ParsedRow[] = [];
  const cardSubtotals: CardSubtotal[] = [];
  const unparsedLines: string[] = [];

  let brand: string | null = null;
  let statementId: string | null = null;
  let periodClose: string | null = null;
  let previousBalanceArs = 0;
  let previousBalanceUsd = 0;
  let declaredTotalArs = 0;
  let declaredTotalUsd = 0;

  let lineNo = 0;
  let cardLast4: string | null = null;
  // El cuerpo va del primer encabezado de transacciones hasta SALDO ACTUAL.
  // Fuera de ahi solo hay cabecera y letra chica, y la letra chica esta llena de
  // porcentajes que el lector confundiria con montos.
  let inBody = false;
  let inMovimientos = false;
  const pending: ParsedRow[] = [];

  for (const line of lines) {
    if (!brand) {
      const b = line.match(/^(VISA|MASTERCARD)\s*:/i);
      if (b) brand = b[1].toUpperCase();
    }
    if (!statementId) {
      const id = line.match(/^NRO DE CUENTA\s*:\s*(\S+)/i);
      if (id) statementId = id[1];
    }
    if (!periodClose) {
      const f = line.match(/^FECHA CIERRE ACTUAL\s*:\s*(\d{4}-\d{2}-\d{2})/i);
      if (f) periodClose = f[1];
    }
    if (!cardLast4) {
      const t = line.match(/^TARJETA\s+(\d{4})\b/i);
      if (t) cardLast4 = t[1];
    }

    const subtotal = line.match(/^TARJETA\s+(\d{4})\b.*?Total Consumos/i);
    if (subtotal) {
      const m = moneyTokens(line);
      cardSubtotals.push({
        cardLast4: subtotal[1],
        declaredArs: parseAmountToCents(m[m.length - 2] ?? "0") ?? 0,
        declaredUsd: parseAmountToCents(m[m.length - 1] ?? "0") ?? 0,
      });
      continue;
    }

    if (/^FECHA DETALLE DE TRANSACCION/i.test(line)) {
      inBody = true;
      inMovimientos = false;
      continue;
    }
    if (/^Movimientos\b/i.test(line)) {
      inMovimientos = true;
      continue;
    }
    if (/^FECHA COMPROBANTE/i.test(line)) continue;

    if (/^SALDO ANTERIOR\b/i.test(line)) {
      const m = moneyTokens(line);
      previousBalanceArs = parseAmountToCents(m[0] ?? "0") ?? 0;
      previousBalanceUsd = parseAmountToCents(m[1] ?? "0") ?? 0;
      continue;
    }

    if (/^SALDO ACTUAL\b/i.test(line)) {
      const m = moneyTokens(line);
      declaredTotalArs = parseAmountToCents(m[0] ?? "0") ?? 0;
      declaredTotalUsd = parseAmountToCents(m[1] ?? "0") ?? 0;
      inBody = false;
      continue;
    }

    if (!inBody) continue;
    if (STRUCTURAL.test(line)) continue;

    const dated = line.match(ISO_DATE);
    const rest = dated ? dated[2] : line;
    const leido = readAmount(rest);
    if (!leido) {
      if (dated) unparsedLines.push(line);
      continue;
    }

    const money = moneyTokens(rest);
    const description = cleanDescription(rest, money[money.length - 1]);
    if (!description) {
      unparsedLines.push(line);
      continue;
    }

    const cuota = parseCuota(rest);
    const row: ParsedRow = {
      lineNo: ++lineNo,
      // Las filas sin fecha son cargos del cierre: se les imputa esa fecha.
      occurredOn: dated ? dated[1] : "",
      rawDescription: description,
      amount: leido.amount,
      currency: leido.currency,
      kind: classify(description, leido.amount),
      tracked: !NOT_TRACKED.test(description),
      cardLast4: null,
      cuotaCurrent: cuota.current,
      cuotaTotal: cuota.total,
    };

    rows.push(row);
    if (inMovimientos) pending.push(row);
  }

  for (const row of pending) row.cardLast4 = cardLast4;
  for (const row of rows) {
    if (!row.occurredOn) {
      row.occurredOn = periodClose ?? "";
      if (!row.occurredOn) unparsedLines.push(row.rawDescription);
    }
  }

  return {
    brand: brand ? `SUPERVIELLE ${brand}` : null,
    statementId,
    periodClose,
    previousBalanceArs,
    previousBalanceUsd,
    declaredTotalArs,
    declaredTotalUsd,
    rows,
    cardSubtotals,
    unparsedLines,
  };
}
