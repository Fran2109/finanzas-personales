/**
 * Lector de resumenes de tarjeta Galicia (VISA y MASTERCARD).
 *
 * Transcribe, no interpreta. La extraccion tiene que ser exacta: si una linea
 * no se entiende va a `unparsedLines` y la reconciliacion la hace fallar
 * ruidosamente, en vez de descartarla en silencio.
 *
 * Aca no hay ningun comercio hardcodeado. Lo unico que el codigo sabe es la
 * ESTRUCTURA del resumen: que lineas no son consumo, como se marcan las cuotas
 * y donde estan los totales. Que significa cada comercio se aprende en
 * `merchant_rules`, no se escribe aca.
 *
 * Los dos formatos difieren mas de lo que uno esperaria del mismo banco:
 * VISA fecha en 20-08-26 y MASTERCARD en 20-Ago-26; VISA marca los dolares con
 * "USD" y MASTERCARD con "U$S"; VISA cierra cada plastico con su subtotal y
 * MASTERCARD no; y MASTERCARD trae ajustes sin fecha.
 */
import { parseAmountToCents, type Cents } from "../money.ts";
import type { Kind } from "../domain.ts";
import type { CardSubtotal, ParsedRow, ParsedStatement } from "./types.ts";

/** Un monto: siempre con coma y exactamente dos decimales. */
const MONEY = /-?[\d.]*\d,\d{2}/g;

const NUMERIC_DATE = /^(\d{2})-(\d{2})-(\d{2})\s+(.*)$/;
const NAMED_DATE = /^(\d{2})-([A-Za-zÁÉÍÓÚáéíóú]{3})-(\d{2})\s+(.*)$/;

const MONTHS: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

/** Marcador de moneda extranjera. VISA escribe USD, MASTERCARD U$S. */
const FOREIGN = /USD|U\$S/i;

/**
 * Lineas de estructura y totales. Tienen montos pero no son movimientos: si se
 * colaran como filas, duplicarian el resumen entero.
 */
const STRUCTURAL =
  /^(SALDO ANTERIOR|SALDO PENDIENTE|SUBTOTAL|TOTAL A PAGAR|TOTAL CONSUMOS|PAGO MINIMO|CONSOLIDADO|DETALLE DEL CONSUMO|CUOTA DEL MES|FECHA REFERENCIA|TARJETA\s+\d{4}|TASAS|LIMITES|L[ÍI]MITES|En pesos|En d[oó]lares|De compras|De financiaci[oó]n|Cuotas a vencer|P[áa]gina)/i;

/**
 * Lineas que aparecen en el resumen y NO son consumo. El orden importa: una
 * devolucion de percepcion ("DEV PER RG 4815") es un impuesto en negativo, no
 * un reintegro de una compra, asi que los impuestos se evaluan antes.
 */
const NOT_CONSUMPTION: ReadonlyArray<{ test: RegExp; kind: Kind }> = [
  { test: /\bSU PAGO\b|\bPAGO MINIMO\b/i, kind: "payment" },
  // Impuestos y percepciones: plata real, pero no consumo.
  { test: /\bIVA\b|\bIIBB\b|\bRG\s*\d{4}\b|\bPERCEP/i, kind: "tax_fee" },
  // Refinanciaciones e intereses son servicio de deuda, no compras.
  { test: /\bCONSOLID\b|\bINTERESES\b|\bPLAN\s+V\b|\bREFINANC/i, kind: "financing" },
  { test: /\bDEV\.?\s?(IMP|PER)\b|\bDEVOLUCION\b/i, kind: "refund" },
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

/** Acepta "20-08-26" y "20-Ago-26". Devuelve null si no es una fecha. */
function readDate(line: string): { iso: string; rest: string } | null {
  const numeric = line.match(NUMERIC_DATE);
  if (numeric) {
    const [, dd, mm, yy, rest] = numeric;
    return { iso: `20${yy}-${mm}-${dd}`, rest };
  }
  const named = line.match(NAMED_DATE);
  if (named) {
    const [, dd, mon, yy, rest] = named;
    const mm = MONTHS[mon.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
    if (mm) return { iso: `20${yy}-${mm}-${dd}`, rest };
  }
  return null;
}

function cleanDescription(rest: string, lastMoney: string): string {
  const cut = rest.lastIndexOf(lastMoney);
  let out = cut > 0 ? rest.slice(0, cut) : rest;

  out = out.replace(/^[*KFC]\s+/, ""); // marca de plastico/rubro al inicio

  // La cola de una fila puede traer varios montos de columna y varios
  // comprobantes. Se pelan de a uno hasta que solo queda la descripcion.
  for (let i = 0; i < 8; i++) {
    const shorter = out
      .replace(/\s+\d{5,}\s*$/, "")
      .replace(/\s*-?[\d.]*\d,\d{2}\s*$/, "");
    if (shorter === out) break;
    out = shorter;
  }

  // El marcador de moneda NO se saca: es parte de como el banco escribe la
  // linea. Sacarlo convertia "SU PAGO EN USD" en "SU PAGO EN", que ademas de
  // quedar cortado deja de decir de que pago se trata.
  return out
    .replace(/\b\d{2}\/\d{2}\b/, "") // marca de cuota, se guarda aparte
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

type Section = "otro" | "consolidado" | "detalle";

export function parseGaliciaStatement(text: string): ParsedStatement {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
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

  let pending: ParsedRow[] = [];
  let lineNo = 0;
  let section: Section = "otro";

  // Ajustes sin fecha: se les imputa el cierre del periodo, que es cuando el
  // banco los aplica.
  const undated: ParsedRow[] = [];

  for (const line of lines) {
    if (!brand) {
      const b = line.match(/Tarjeta Cr[eé]dito\s+([A-Z][A-Z ]+)/i);
      if (b) brand = b[1].trim();
    }
    if (!statementId) {
      const id = line.match(/Resumen N°\s*(\S+)/i);
      if (id) statementId = id[1];
    }
    if (!periodClose) {
      // El codigo de barras del resumen arranca con la fecha de cierre.
      const stamp = line.match(/^(\d{4})(\d{2})(\d{2})\d{6,}[A-Z]?$/);
      if (stamp) periodClose = `${stamp[1]}-${stamp[2]}-${stamp[3]}`;
    }

    if (/^CONSOLIDADO\b/i.test(line)) {
      section = "consolidado";
      continue;
    }
    if (/^DETALLE DEL CONSUMO\b/i.test(line)) {
      section = "detalle";
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

    // Fuera del cuerpo del resumen no hay movimientos, solo letra chica. Sin
    // este corte, un "CFT TEA 205,62%" del reverso entraria como una compra.
    if (section === "otro") continue;
    if (STRUCTURAL.test(line)) continue;

    const dated = readDate(line);
    // Los ajustes sin fecha solo se aceptan en el consolidado, que es donde el
    // banco los pone.
    if (!dated && section !== "consolidado") continue;

    const rest = dated ? dated.rest : line;
    const money = moneyTokens(rest);
    if (money.length === 0) {
      if (dated) unparsedLines.push(line);
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
      occurredOn: dated ? dated.iso : "",
      rawDescription: description,
      amount,
      // El monto en moneda extranjera viene en su propia columna; al aplanar el
      // PDF la unica marca que sobrevive es el USD / U$S en la linea.
      currency: FOREIGN.test(rest) ? "USD" : "ARS",
      kind: classify(description, amount),
      cardLast4: null,
      cuotaCurrent: cuota.current,
      cuotaTotal: cuota.total,
    };

    rows.push(row);
    if (!dated) undated.push(row);

    // Impuestos y pagos no cuelgan de un plastico: van al resumen consolidado.
    if (
      section === "detalle" &&
      (row.kind === "consumption" || row.kind === "refund" || row.kind === "financing")
    ) {
      pending.push(row);
    }
  }

  for (const row of undated) {
    row.occurredOn = periodClose ?? row.occurredOn;
    if (!row.occurredOn) unparsedLines.push(row.rawDescription);
  }

  return {
    brand,
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
