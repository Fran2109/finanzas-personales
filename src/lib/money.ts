/**
 * Plata, en centavos.
 *
 * Regla del proyecto: en la base `numeric(18,2)`, en el cliente enteros en
 * centavos. Nunca float. Todo lo que entra o sale de la UI pasa por aca.
 */

/** Centavos. Entero con signo. */
export type Cents = number;

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

/**
 * Parsea lo que escribe una persona a centavos.
 *
 * Acepta las formas que uno tipea de verdad: "1.234,56", "1234,56", "1234.56",
 * "1234", "$ 1.234,56". Devuelve null si no se entiende, para que el llamador
 * decida el mensaje de error.
 *
 * La ambiguedad real es "1.234": en es-AR es mil doscientos treinta y cuatro,
 * no uno coma doscientos treinta y cuatro. Se resuelve mirando el ultimo
 * separador: si le siguen exactamente 2 digitos y hay otro separador antes, es
 * decimal; si el grupo tiene 3 digitos, es de miles.
 */
export function parseAmountToCents(input: string): Cents | null {
  const raw = input.trim().replace(/[\s$]/g, "");
  if (raw === "") return null;

  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  if (!/^[\d.,]+$/.test(body)) return null;

  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);

  let intPart: string;
  let decPart: string;

  if (lastSep === -1) {
    intPart = body;
    decPart = "";
  } else {
    const tail = body.slice(lastSep + 1);
    if (tail.length <= 2) {
      // 1 o 2 digitos despues del ultimo separador: son los centavos.
      intPart = body.slice(0, lastSep);
      decPart = tail;
    } else if (tail.length === 3) {
      // Un grupo de 3 es de miles ("1.234", "1.234.567"). Con 2 decimales en la
      // base, 3 digitos decimales no serian representables igual.
      intPart = body;
      decPart = "";
    } else {
      return null;
    }
  }

  // Si la parte entera trae separadores, tienen que agrupar de a 3 de verdad:
  // "1.234.567" pasa, "1.2.3" es un error de tipeo y no un monto.
  if (/[.,]/.test(intPart)) {
    const sep = intPart.includes(".") ? "." : ",";
    if (intPart.includes(sep === "." ? "," : ".")) return null;
    const groups = intPart.split(sep);
    const wellGrouped =
      /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((g) => /^\d{3}$/.test(g));
    if (!wellGrouped) return null;
  }

  intPart = intPart.replace(/[.,]/g, "");
  if (intPart === "") intPart = "0";
  if (!/^\d+$/.test(intPart)) return null;
  if (decPart !== "" && !/^\d{1,2}$/.test(decPart)) return null;

  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0") || 0);
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/**
 * Centavos -> string para mandar a `numeric(18,2)`.
 *
 * Se arma por aritmetica entera a proposito: dividir por 100 metaria un float
 * en el camino justo antes de escribir en la base.
 */
export function centsToNumeric(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${String(frac).padStart(2, "0")}`;
}

/**
 * Lo que devuelve PostgREST para una columna `numeric` es un number de JSON.
 * 2311332.70 no es exacto en binario, asi que se redondea al centavo en vez de
 * multiplicar y confiar. Exacto para cualquier monto por debajo de ~9e13.
 */
export function centsFromDb(value: number | string | null): Cents {
  if (value === null) return 0;
  if (typeof value === "string") return parseAmountToCents(value) ?? 0;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : 0;
}

const FORMATTERS: Record<string, Intl.NumberFormat> = {};

function formatter(currency: string): Intl.NumberFormat {
  FORMATTERS[currency] ??= new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return FORMATTERS[currency];
}

/** "$ 1.234,56" / "US$ 31,71" */
export function formatCents(cents: Cents, currency = "ARS"): string {
  return formatter(currency).format(cents / 100);
}

/**
 * Corto, para etiquetas de grafico: "1,0 M", "900 k", "$ 1,0 M".
 *
 * En un eje o en la punta de una barra no entra "1.002.524,03" y ademas no
 * aporta: ahi se lee el orden de magnitud, y el numero exacto esta en la lista
 * de abajo y en el tooltip.
 */
export function formatCompact(cents: Cents, currency?: string): string {
  const pesos = cents / 100;
  const abs = Math.abs(pesos);
  const simbolo = currency ? (currency === "ARS" ? "$ " : "US$ ") : "";

  const [valor, sufijo] =
    abs >= 1_000_000
      ? [pesos / 1_000_000, " M"]
      : abs >= 1_000
        ? [pesos / 1_000, " k"]
        : [pesos, ""];

  // Un decimal solo cuando el numero es chico: "1,2 M" dice algo, "902,4 k" no.
  const decimales = sufijo !== "" && Math.abs(valor) < 10 ? 1 : 0;
  return (
    simbolo +
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(valor) +
    sufijo
  );
}

/** Sin simbolo, para tablas donde la moneda ya esta en el encabezado. */
export function formatCentsPlain(cents: Cents): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export { MAX_SAFE_CENTS };
