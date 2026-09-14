/**
 * Lector de la lista de consumos pegada del home banking.
 *
 * Existe porque el resumen del mes en curso todavia no cerro y por lo tanto no
 * hay PDF, pero los consumos ya estan a la vista en el home banking. Copiar esa
 * tabla y pegarla es la unica forma de ver como viene el mes antes del cierre.
 *
 * Lo que se carga asi es **provisorio**: cuando llegue el PDF lo reemplaza. Por
 * eso vale la pena leerlo con la misma disciplina que un resumen de verdad.
 *
 * La diferencia importante con un PDF es que tipo de total declara la fuente.
 * Un resumen cerrado declara un SALDO A PAGAR, que incluye adentro el pago del
 * mes anterior. El home banking declara el TOTAL CONSUMIDO del periodo, y el
 * pago queda afuera. Por eso el pago va a `outsideTotal`: se transcribe, se
 * muestra en la revision, pero no entra en la suma que el gate compara.
 *
 * Como todo lector de este proyecto: transcribe, no interpreta. Aca no hay
 * ningun comercio hardcodeado, solo la estructura de la tabla.
 */
import { parseAmountToCents, type Cents } from "../money.ts";
import type { Currency, Kind } from "../domain.ts";
import type { ParsedRow, ParsedStatement } from "./types.ts";

/** Encabezados de la tabla. No son datos. */
const HEADERS = new Set([
  "fecha",
  "tarjeta",
  "descripcion",
  "cuotas",
  "importe en pesos",
  "importe en dolares",
  "importe",
  "movimiento",
  "movimientos",
]);

const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const CARD = /^(VISA|MASTERCARD|MASTER|AMEX)\s*[-–—]?\s*(\d{4})$/i;
const CUOTA = /^(\d{1,2})\s*(?:de|\/)\s*(\d{1,3})$/i;
const AMOUNT = /^(-?)\s*(USD|U\$S|US\$|ARS|\$)\s*(-?)\s*([\d.,]+)$/i;
const TOTAL = /^total(?:\s+(?:general|del\s+periodo|de\s+consumos))?$/i;

/**
 * El pago de la tarjeta. El home banking lo lista entre los movimientos pero lo
 * deja afuera del total: es plata que entro a cancelar el resumen anterior, no
 * consumo del periodo.
 *
 * El limite de palabra no es decorativo: sin el, "MERPAGO" matchearia y cada
 * compra por Mercado Pago se leeria como un pago de tarjeta.
 */
const PAYMENT = /\bSU PAGO\b|\bPAGO M[IÍ]NIMO\b|\bPAGO MINIMO\b|\bPAGO DE TU TARJETA\b|\bTU PAGO\b/i;

/**
 * Lineas que no son consumo.
 *
 * Es la union de lo que reconocen los dos lectores de PDF, y a proposito no se
 * comparte con ellos: cada banco escribe sus propias lineas de estructura y
 * ahi la duplicacion es mas barata que un modulo que tenga que servir a los
 * tres formatos a la vez. Lo que describe esta lista son reglas del dominio
 * (que es impuesto, que es refinanciacion), no formato.
 */
const NOT_CONSUMPTION: ReadonlyArray<{ test: RegExp; kind: Kind }> = [
  { test: PAYMENT, kind: "payment" },
  { test: /\bIVA\b|\bIIBB\b|\bSELLOS\b|\bRG\s*\d{4}\b|\bPERCEP/i, kind: "tax_fee" },
  {
    test: /\bCONSOLID\b|\bINTERESES\b|\bPLAN\s+V\b|\bREFINANC|\bPUNITORIO/i,
    kind: "financing",
  },
  { test: /\bDEV\.?\s?(IMP|PER)\b|\bDEVOLUCION\b/i, kind: "refund" },
];

/** Lo que se transcribe pero la app no registra. */
const NOT_TRACKED = /\bDEV\.?\s?(IMP|PER)\b/i;

function classify(description: string, amount: Cents): Kind {
  for (const { test, kind } of NOT_CONSUMPTION) {
    if (test.test(description)) return kind;
  }
  return amount < 0 ? "refund" : "consumption";
}

function normalizeHeader(line: string): string {
  return line
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readAmount(line: string): { amount: Cents; currency: Currency } | null {
  const m = line.match(AMOUNT);
  if (!m) return null;
  const cents = parseAmountToCents(m[4]);
  if (cents === null) return null;
  const negative = m[1] === "-" || m[3] === "-";
  const currency: Currency = /^(ARS|\$)$/i.test(m[2]) ? "ARS" : "USD";
  return { amount: negative ? -cents : cents, currency };
}

/** Un bloque de la tabla: todo lo que viene despues de una fecha. */
type Bloque = {
  lineNo: number;
  occurredOn: string;
  parts: string[];
  amounts: { amount: Cents; currency: Currency }[];
  cardLast4: string | null;
  network: string | null;
  cuotaCurrent: number | null;
  cuotaTotal: number | null;
};

function bloqueVacio(lineNo: number, occurredOn: string): Bloque {
  return {
    lineNo,
    occurredOn,
    parts: [],
    amounts: [],
    cardLast4: null,
    network: null,
    cuotaCurrent: null,
    cuotaTotal: null,
  };
}

export function parsePastedStatement(text: string): ParsedStatement {
  const lines = text
    .split("\n")
    // Pegar desde un navegador puede traer los links en sintaxis markdown.
    .map((l) => l.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const bloques: Bloque[] = [];
  const unparsedLines: string[] = [];
  let declaredTotalArs: Cents = 0;
  let declaredTotalUsd: Cents = 0;
  let sawTotal = false;

  let current: Bloque | null = null;
  let inFooter = false;

  lines.forEach((line, i) => {
    if (inFooter) {
      const monto = readAmount(line);
      if (monto) {
        if (monto.currency === "ARS") declaredTotalArs = monto.amount;
        else declaredTotalUsd = monto.amount;
      }
      return;
    }

    if (TOTAL.test(line)) {
      inFooter = true;
      sawTotal = true;
      return;
    }

    const fecha = line.match(DATE);
    if (fecha) {
      if (current) bloques.push(current);
      const [, dd, mm, yyyy] = fecha;
      current = bloqueVacio(i + 1, `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
      return;
    }

    if (!current) {
      // Antes de la primera fecha solo hay encabezado. Lo que no se reconoce
      // igual se ignora: es el cromo de la pagina, no movimientos, y el gate
      // sobre el total es lo que protege de perder una fila de verdad.
      return;
    }

    const card = line.match(CARD);
    if (card) {
      current.network = card[1].toUpperCase();
      current.cardLast4 = card[2];
      return;
    }

    const cuota = line.match(CUOTA);
    if (cuota) {
      current.cuotaCurrent = Number(cuota[1]);
      current.cuotaTotal = Number(cuota[2]);
      return;
    }

    const monto = readAmount(line);
    if (monto) {
      current.amounts.push(monto);
      return;
    }

    // Cualquier otra cosa dentro del bloque es la descripcion. Un comercio
    // puede venir partido en varias lineas y se pega de nuevo.
    if (!HEADERS.has(normalizeHeader(line))) current.parts.push(line);
  });

  if (current) bloques.push(current);

  const rows: ParsedRow[] = [];
  const outsideTotal: ParsedRow[] = [];

  for (const bloque of bloques) {
    const rawDescription = bloque.parts.join(" ").replace(/\s+/g, " ").trim();

    // Las dos columnas vienen en la misma fila con una en cero. Tomar la
    // primera leeria 0,00 en toda fila que traiga las dos.
    const conMonto = bloque.amounts.filter((a) => a.amount !== 0);
    if (rawDescription === "" || conMonto.length !== 1) {
      unparsedLines.push(
        `${bloque.occurredOn} ${rawDescription || "(sin descripcion)"}`.trim(),
      );
      continue;
    }

    const { amount, currency } = conMonto[0];
    const kind = classify(rawDescription, amount);

    const row: ParsedRow = {
      lineNo: bloque.lineNo,
      occurredOn: bloque.occurredOn,
      rawDescription,
      amount,
      currency,
      kind,
      cardLast4: bloque.cardLast4,
      cuotaCurrent: bloque.cuotaCurrent,
      cuotaTotal: bloque.cuotaTotal,
      tracked: !NOT_TRACKED.test(rawDescription) && kind !== "payment",
    };

    if (kind === "payment") outsideTotal.push(row);
    else rows.push(row);
  }

  if (!sawTotal) {
    unparsedLines.push(
      "Falta la linea 'Total': sin ella no hay contra que verificar la suma.",
    );
  }

  // La marca sale de los plasticos, que es lo unico que la tabla dice de la
  // tarjeta. El banco no aparece: adentro del home banking ya se sabe cual es.
  const networks = [...new Set(bloques.map((b) => b.network).filter(Boolean))];

  return {
    brand: networks.length === 1 ? networks[0] : null,
    statementId: null,
    periodClose: null,
    previousBalanceArs: 0,
    previousBalanceUsd: 0,
    declaredTotalArs,
    declaredTotalUsd,
    rows,
    outsideTotal,
    cardSubtotals: [],
    unparsedLines,
  };
}
