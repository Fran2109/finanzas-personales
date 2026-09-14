/**
 * Lector de resumenes Galicia VISA.
 *
 * Transcribe, no interpreta. La extraccion tiene que ser exacta: si una linea
 * no se entiende va a `unparsedLines` y la reconciliacion la va a hacer fallar
 * ruidosamente, en vez de descartarla en silencio.
 *
 * Aca no hay ningun comercio hardcodeado. Lo unico que el codigo sabe es la
 * ESTRUCTURA del resumen: que lineas no son consumo, como se marcan las cuotas
 * y donde estan los totales. Que significa cada comercio se aprende en
 * `merchant_rules`, no se escribe aca.
 */
import { parseAmountToCents, type Cents } from "../money.ts";
import type { Kind } from "../domain.ts";
import type { CardSubtotal, ParsedRow, ParsedStatement } from "./types.ts";

/** Un monto: siempre con coma y exactamente dos decimales. */
const MONEY = /-?[\d.]*\d,\d{2}/g;

const DATE_LINE = /^(\d{2})-(\d{2})-(\d{2})\s+(.*)$/;

/**
 * Lineas que aparecen en el resumen y NO son consumo. Es el bug mas comun del
 * dominio: contar el consumo del resumen Y el pago desde el banco duplica todo.
 */
const NOT_CONSUMPTION: ReadonlyArray<{ test: RegExp; kind: Kind }> = [
  { test: /\bSU PAGO\b|\bPAGO MINIMO\b/i, kind: "payment" },
  { test: /\bDEV\.?IMP\b|\bDEVOLUCION\b/i, kind: "refund" },
  // Refinanciaciones e intereses son servicio de deuda, no compras.
  { test: /\bCONSOLID\b|\bINTERESES\b|\bPLAN\s+V\b|\bREFINANC/i, kind: "financing" },
  // Impuestos y percepciones: plata real, pero no consumo.
  { test: /\bIVA\b|\bIIBB\b|\bRG\s*\d{4}\b|\bPERCEP/i, kind: "tax_fee" },
];

function classify(description: string, amount: Cents): Kind {
  for (const { test, kind } of NOT_CONSUMPTION) {
    if (test.test(description)) return kind;
  }
  // En el detalle de consumo, un negativo es una devolucion del comercio.
  return amount < 0 ? "refund" : "consumption";
}

function moneyTokens(line: string): string[] {
  return line.match(MONEY) ?? [];
}

/** "20-08-26" -> "2026-08-20". El resumen siempre usa dos digitos de anio. */
function toIsoDate(dd: string, mm: string, yy: string): string {
  return `20${yy}-${mm}-${dd}`;
}

function cleanDescription(rest: string, lastMoney: string): string {
  // Corta todo desde el ultimo monto: lo que sigue es columna, no descripcion.
  const cut = rest.lastIndexOf(lastMoney);
  let out = cut > 0 ? rest.slice(0, cut) : rest;

  out = out.replace(/^[*KFC]\s+/, ""); // marca de plastico/rubro al inicio

  // Comprobantes al final, que pueden venir de a varios ("... 9600043671 000001").
  for (let i = 0; i < 4; i++) {
    const shorter = out.replace(/\s+\d{5,}\s*$/, "");
    if (shorter === out) break;
    out = shorter;
  }

  return out
    .replace(/USD\s+[\d.,]+\s*$/i, "") // cola "USD 1,22" de las lineas en dolares
    .replace(/\b\d{2}\/\d{2}\b/, "")   // marca de cuota, se guarda aparte
    .replace(/\s+/g, " ")
    .trim();
}

function parseCuota(rest: string): { current: number | null; total: number | null } {
  const nn = rest.match(/\b(\d{2})\/(\d{2})\b/);
  if (nn) return { current: Number(nn[1]), total: Number(nn[2]) };
  // Los planes consolidados se marcan "5-12" en vez de "05/12".
  const consolid = rest.match(/\bCONSOLID\s+(\d{1,2})-(\d{1,2})\b/i);
  if (consolid) return { current: Number(consolid[1]), total: Number(consolid[2]) };
  return { current: null, total: null };
}

export function parseGaliciaVisa(text: string): ParsedStatement {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const rows: ParsedRow[] = [];
  const cardSubtotals: CardSubtotal[] = [];
  const unparsedLines: string[] = [];

  let statementId: string | null = null;
  let periodClose: string | null = null;
  let previousBalanceArs = 0;
  let previousBalanceUsd = 0;
  let declaredTotalArs = 0;
  let declaredTotalUsd = 0;

  // Filas que todavia no saben a que plastico pertenecen: se les asigna cuando
  // aparece su linea de subtotal, que es la que nombra la tarjeta.
  let pending: ParsedRow[] = [];
  let lineNo = 0;
  // El bloque CONSOLIDADO (saldo anterior, pagos, ajustes) no pertenece a
  // ningun plastico: recien despues de DETALLE DEL CONSUMO las filas son de una
  // tarjeta concreta.
  let inDetail = false;

  for (const line of lines) {
    if (!statementId) {
      const id = line.match(/Resumen N°\s*(\S+)/i);
      if (id) statementId = id[1];
    }
    if (!periodClose) {
      // El codigo de barras del resumen arranca con la fecha de cierre.
      const stamp = line.match(/^(\d{4})(\d{2})(\d{2})\d{6,}[A-Z]?$/);
      if (stamp) periodClose = `${stamp[1]}-${stamp[2]}-${stamp[3]}`;
    }

    if (/^DETALLE DEL CONSUMO\b/i.test(line)) {
      inDetail = true;
      continue;
    }

    if (/^SALDO ANTERIOR\b/i.test(line)) {
      const m = moneyTokens(line);
      previousBalanceArs = parseAmountToCents(m[0] ?? "0") ?? 0;
      previousBalanceUsd = parseAmountToCents(m[1] ?? "0") ?? 0;
      continue;
    }

    if (/^TOTAL A PAGAR\b/i.test(line)) {
      const m = moneyTokens(line);
      declaredTotalArs = parseAmountToCents(m[0] ?? "0") ?? 0;
      declaredTotalUsd = parseAmountToCents(m[1] ?? "0") ?? 0;
      continue;
    }

    const subtotal = line.match(/^TARJETA\s+(\d{4})\b.*?Total Consumos/i);
    if (subtotal) {
      const m = moneyTokens(line);
      cardSubtotals.push({
        cardLast4: subtotal[1],
        declaredArs: parseAmountToCents(m[m.length - 2] ?? "0") ?? 0,
        declaredUsd: parseAmountToCents(m[m.length - 1] ?? "0") ?? 0,
      });
      for (const row of pending) row.cardLast4 = subtotal[1];
      pending = [];
      continue;
    }

    const dated = line.match(DATE_LINE);
    if (!dated) continue;

    const [, dd, mm, yy, rest] = dated;
    const money = moneyTokens(rest);
    if (money.length === 0) {
      unparsedLines.push(line);
      continue;
    }

    const lastMoney = money[money.length - 1];
    const amount = parseAmountToCents(lastMoney);
    if (amount === null) {
      unparsedLines.push(line);
      continue;
    }

    const description = cleanDescription(rest, lastMoney);
    if (!description) {
      unparsedLines.push(line);
      continue;
    }

    const cuota = parseCuota(rest);
    const row: ParsedRow = {
      lineNo: ++lineNo,
      occurredOn: toIsoDate(dd, mm, yy),
      rawDescription: description,
      amount,
      // El monto en dolares viene en su propia columna; al aplanar el PDF la
      // unica marca que sobrevive es el "USD" en la linea.
      currency: /USD/i.test(rest) ? "USD" : "ARS",
      kind: classify(description, amount),
      cardLast4: null,
      cuotaCurrent: cuota.current,
      cuotaTotal: cuota.total,
    };

    rows.push(row);
    // Impuestos y pagos no cuelgan de un plastico: van al resumen consolidado.
    if (
      inDetail &&
      (row.kind === "consumption" || row.kind === "refund" || row.kind === "financing")
    ) {
      pending.push(row);
    }
  }

  return {
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
