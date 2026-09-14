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
 * **Un solo lector para las dos tablas, al reves que con los PDF.** Los
 * resumenes cerrados de cada banco no comparten casi nada y por eso tienen un
 * lector cada uno. Las tablas pegadas si comparten la forma: un movimiento es
 * un grupo de celdas que **termina en su importe**. Lo que cambia entre bancos
 * es el ORDEN de los campos —uno pone la fecha primero y el otro la
 * descripcion, uno el Total al final y el otro al principio— y a este modelo el
 * orden no le importa. Meterle un lector por banco seria duplicar todo para
 * distinguir algo que no hace falta distinguir.
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

// La fecha arranca la linea; lo que le sigue puede traer la cuota pegada
// ("07/09/2026 Cuota 1/3") o no traer nada ("10/09/2026").
const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\b\s*(.*)$/;
const CARD = /^(VISA|MASTERCARD|MASTER|AMEX)\s*[-–—]?\s*(\d{4})$/i;
const CUOTA = /^(?:cuota\s*)?(\d{1,2})\s*(?:de|\/)\s*(\d{1,3})$/i;
const CUOTA_INLINE = /(?:cuota\s*)?\b(\d{1,2})\s*(?:de|\/)\s*(\d{1,3})\b/i;
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

/**
 * Un movimiento en crudo: las celdas que se juntaron hasta su importe.
 *
 * No sabe en que orden vienen. Un banco pone la fecha primero y la descripcion
 * despues, el otro al reves; aca todo eso es `textLines` y se ordena al cerrar.
 */
type Bloque = {
  lineNo: number;
  textLines: string[];
  amounts: { amount: Cents; currency: Currency }[];
};

function bloqueVacio(lineNo: number): Bloque {
  return { lineNo, textLines: [], amounts: [] };
}

/** Si la linea abre con una fecha. Es lo unico que puede partir dos bloques. */
function fechaDe(line: string): { iso: string; resto: string } | null {
  const m = line.match(DATE);
  if (!m) return null;
  const [, dd, mm, yyyy, resto] = m;
  return {
    iso: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
    resto: resto ?? "",
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
  let totales = 0;

  let actual = bloqueVacio(1);
  let enTotales = false;

  const cerrar = () => {
    if (actual.textLines.length > 0 || actual.amounts.length > 0) bloques.push(actual);
  };

  lines.forEach((line, i) => {
    if (TOTAL.test(line)) {
      cerrar();
      actual = bloqueVacio(i + 2);
      totales += 1;
      enTotales = true;
      return;
    }

    const monto = readAmount(line);

    // Despues de "Total" vienen los totales declarados, hasta la primera linea
    // que no sea un monto. Un banco los pone al final de la tabla y el otro
    // arriba de todo, y asi los dos caen en el mismo lugar.
    if (enTotales) {
      if (monto) {
        if (monto.currency === "ARS") declaredTotalArs = monto.amount;
        else declaredTotalUsd = monto.amount;
        return;
      }
      enTotales = false;
    }

    if (monto) {
      actual.amounts.push(monto);
      return;
    }

    // Una linea que no es monto cierra el bloque anterior si ese ya tenia su
    // importe: el importe es lo ultimo de cada movimiento en las dos tablas.
    if (actual.amounts.length > 0) {
      cerrar();
      actual = bloqueVacio(i + 1);
    }

    const fecha = fechaDe(line);
    // Dos fechas en el mismo bloque significa que al anterior le falto el
    // importe. Cerrarlo ahi lo deja sin monto y termina en unparsedLines, que
    // es exactamente lo que tiene que pasar: una fila perdida en silencio es el
    // modo de falla que este lector existe para evitar.
    if (fecha && actual.textLines.some((t) => fechaDe(t))) {
      cerrar();
      actual = bloqueVacio(i + 1);
    }

    if (!HEADERS.has(normalizeHeader(line))) actual.textLines.push(line);
  });

  cerrar();

  if (totales === 0) {
    unparsedLines.push(
      "Falta la linea 'Total': sin ella no hay contra que verificar la suma.",
    );
  } else if (totales > 1) {
    // Dos totales serian dos tablas pegadas una atras de la otra. Sumarlas
    // dejaria pasar el pegado repetido por accidente, que duplica el mes
    // entero sin que nada lo note.
    unparsedLines.push(
      `Hay ${totales} lineas 'Total'. Pega una sola lista por vez.`,
    );
  }

  const rows: ParsedRow[] = [];
  const outsideTotal: ParsedRow[] = [];
  const plasticos: string[] = [];

  for (const bloque of bloques) {
    let occurredOn: string | null = null;
    let cardLast4: string | null = null;
    let cuotaCurrent: number | null = null;
    let cuotaTotal: number | null = null;
    const parts: string[] = [];

    for (const line of bloque.textLines) {
      const fecha = fechaDe(line);
      if (fecha) {
        occurredOn = fecha.iso;
        // Un banco pega la cuota a la fecha ("07/09/2026 Cuota 1/3") y el otro
        // le da su propia celda. Las dos formas terminan aca.
        const inline = fecha.resto.match(CUOTA_INLINE);
        if (inline) {
          cuotaCurrent = Number(inline[1]);
          cuotaTotal = Number(inline[2]);
        } else if (fecha.resto.trim()) {
          parts.push(fecha.resto.trim());
        }
        continue;
      }

      const card = line.match(CARD);
      if (card) {
        plasticos.push(card[1].toUpperCase());
        cardLast4 = card[2];
        continue;
      }

      const cuota = line.match(CUOTA);
      if (cuota) {
        cuotaCurrent = Number(cuota[1]);
        cuotaTotal = Number(cuota[2]);
        continue;
      }

      parts.push(line);
    }

    const rawDescription = parts.join(" ").replace(/\s+/g, " ").trim();

    // Las dos columnas vienen en la misma fila con una en cero. Tomar la
    // primera leeria 0,00 en toda fila que traiga las dos.
    const conMonto = bloque.amounts.filter((a) => a.amount !== 0);

    if (rawDescription === "" || occurredOn === null || conMonto.length !== 1) {
      unparsedLines.push(
        [occurredOn ?? "", rawDescription || "(sin descripcion)"]
          .filter(Boolean)
          .join(" ")
          .trim() || "(monto suelto, sin movimiento)",
      );
      continue;
    }

    const { amount, currency } = conMonto[0];
    const kind = classify(rawDescription, amount);

    const row: ParsedRow = {
      lineNo: bloque.lineNo,
      occurredOn,
      rawDescription,
      amount,
      currency,
      kind,
      cardLast4,
      cuotaCurrent,
      cuotaTotal,
      tracked: !NOT_TRACKED.test(rawDescription) && kind !== "payment",
    };

    if (kind === "payment") outsideTotal.push(row);
    else rows.push(row);
  }

  // La marca sale de los plasticos, que es lo unico que una de las dos tablas
  // dice de la tarjeta. La otra no nombra ni la marca ni el banco: adentro del
  // home banking ya se sabe cual es.
  const networks = [...new Set(plasticos)];

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
