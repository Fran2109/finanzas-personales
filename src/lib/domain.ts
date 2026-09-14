/**
 * Semantica economica del dominio.
 *
 * `kind` es lo que separa "gaste" de "movi plata". El bug mas comun de este
 * dominio es contar el consumo del resumen Y el pago de la tarjeta desde el
 * banco: son la misma plata vista dos veces. Por eso los reportes de gasto
 * filtran por kind y no suman todo lo que haya.
 */

export const KINDS = [
  "consumption",
  "income",
  "payment",
  "refund",
  "tax_fee",
  "financing",
  "transfer",
  "installment",
] as const;

export type Kind = (typeof KINDS)[number];

export const CURRENCIES = ["ARS", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ACCOUNT_TYPES = ["bank", "cash", "credit_card", "investment"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

export function isAccountType(value: string): value is AccountType {
  return (ACCOUNT_TYPES as readonly string[]).includes(value);
}

/** Como se muestra cada kind, y que explica de verdad. */
export const KIND_LABELS: Record<Kind, string> = {
  consumption: "Gasto",
  income: "Ingreso",
  payment: "Pago de tarjeta",
  refund: "Reintegro",
  tax_fee: "Impuesto o comision",
  financing: "Costo financiero",
  transfer: "Transferencia",
  installment: "Cuotas",
};

export const KIND_HELP: Record<Kind, string> = {
  consumption: "Plata que gastaste.",
  income: "Plata que entra: sueldo, freelance, intereses.",
  payment:
    "Plata que sale del banco para pagar el resumen. No es un gasto nuevo: el gasto ya se conto cuando se consumio.",
  refund: "Una devolucion. Resta del consumo del mes.",
  tax_fee: "IVA, IIBB, percepciones. Es plata real, pero no es consumo.",
  financing: "Intereses y refinanciaciones. Servicio de deuda, no una compra.",
  transfer: "Movimiento entre cuentas propias. No cambia el patrimonio.",
  installment:
    "Un gasto en cuotas. Cuenta igual que cualquier gasto, pero queda marcado.",
};

/**
 * Que familia de categorias corresponde a cada tipo de movimiento.
 *
 * Es lo que evita imputar una compra a "Sueldo". Si el tipo de un movimiento
 * cambia, su categoria deja de ser valida y hay que elegir de nuevo.
 */
export const CATEGORY_KIND_FOR: Record<Kind, string> = {
  consumption: "expense",
  // Una cuota usa las mismas categorias que cualquier gasto: el tipo dice que
  // es financiada, la categoria sigue diciendo que se compro.
  installment: "expense",
  // Los que no se registran igual necesitan una familia para que el tipo
  // compile; ninguna pantalla los ofrece.
  refund: "expense",
  tax_fee: "expense",
  financing: "expense",
  income: "income",
  transfer: "transfer",
  payment: "transfer",
};


/**
 * Lo que la app registra: dos tipos de gasto y nada mas.
 *
 * - `consumption`  un gasto
 * - `installment`  un gasto en cuotas
 *
 * Todo lo demas se pasa a uno de los dos. Impuestos, percepciones e intereses
 * son plata que salio: son gastos. Una devolucion es un gasto negativo. Meter
 * una taxonomia mas fina obligaba a decidir en cada carga a que cajon va algo,
 * y la respuesta casi siempre era "es plata que gaste".
 *
 * `income`, `payment` y `transfer` siguen siendo valores validos en la base
 * porque el importador los necesita para transcribir un resumen y que
 * reconcilie, pero no se escriben en `transactions`.
 */
export const EXPENSE_KINDS: readonly Kind[] = ["consumption", "installment"];

export function isExpenseKind(kind: Kind): boolean {
  return EXPENSE_KINDS.includes(kind);
}

/**
 * Colapsa lo que clasifico el lector del resumen a los dos tipos de la app.
 *
 * Lo que tiene marca de cuota es cuota; todo el resto es gasto. Devuelve null
 * para lo que no es un gasto y por lo tanto no se importa.
 */
export function toExpenseKind(kind: Kind, cuotaCurrent: number | null): Kind | null {
  if (kind === "payment" || kind === "transfer" || kind === "income") return null;
  return cuotaCurrent ? "installment" : "consumption";
}

/** Lo que se puede cargar a mano es exactamente lo que la app registra. */
export const MANUAL_KINDS: readonly Kind[] = EXPENSE_KINDS;


/**
 * Efecto de un movimiento sobre el saldo de la cuenta donde esta la fila.
 *
 * Convencion del proyecto: `amount` se guarda siempre positivo, tal como figura
 * en el resumen, y la direccion la da el `kind`. El saldo es con signo: una
 * tarjeta con deuda da negativo.
 *
 * `payment` es el unico que depende de la cuenta, porque es una sola operacion
 * con dos patas: sale del banco (baja el saldo) y cancela deuda de la tarjeta
 * (sube el saldo, que estaba negativo).
 */
export function balanceSign(kind: Kind, isLiability: boolean): -1 | 0 | 1 {
  switch (kind) {
    case "income":
    case "refund":
      return 1;
    case "consumption":
    case "installment":
    case "tax_fee":
    case "financing":
      return -1;
    case "payment":
      return isLiability ? 1 : -1;
    case "transfer":
      // Una transferencia son dos filas atadas por transfer_group_id, una por
      // cuenta. Hasta que la fase 2 modele el par, no se le asigna direccion.
      return 0;
  }
}

/**
 * Kinds cuya direccion es "vuelve plata a esta cuenta". Se guardan en magnitud.
 *
 * El resumen imprime los pagos y las devoluciones en negativo, y el importador
 * los transcribe asi para poder reconciliar contra el total declarado. Pero el
 * saldo se calcula como balanceSign(kind) * amount, y esos kinds ya valen +1:
 * dejar el monto negativo invertiria el signo dos veces y un pago de tarjeta
 * terminaria sumando deuda en vez de cancelarla.
 *
 * Los kinds de salida (consumption, installment, tax_fee, financing) conservan
 * su signo a proposito: ahi un negativo es una reversion (una devolucion de
 * percepcion, una nota de credito) y al multiplicar por -1 se invierte solo,
 * que es justo lo que corresponde.
 */
const MAGNITUDE_KINDS: readonly Kind[] = ["income", "refund", "payment"];

/** Deja el monto en la convencion que espera `balanceSign`. */
export function normalizeAmountForKind(amount: number, kind: Kind): number {
  return MAGNITUDE_KINDS.includes(kind) ? Math.abs(amount) : amount;
}

/** "2026-09" */
export type Period = string;

export function periodOf(date: Date): Period {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isPeriod(value: string): value is Period {
  return /^\d{4}-\d{2}$/.test(value);
}

/** Primer y ultimo dia del periodo, como `date` de Postgres. */
export function periodRange(period: Period): { from: string; to: string } {
  const [year, month] = period.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${period}-01`,
    to: `${period}-${String(last).padStart(2, "0")}`,
  };
}

/**
 * Periodo del resumen a partir de su fecha de cierre.
 *
 * El resumen que cierra el 20 de agosto es el de agosto, aunque venza en
 * septiembre y traiga compras de junio.
 */
export function periodOfDate(isoDate: string): Period | null {
  const m = isoDate.match(/^(\d{4})-(\d{2})-\d{2}$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function shiftPeriod(period: Period, months: number): Period {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "septiembre 2026" */
export function formatPeriod(period: Period): string {
  const [year, month] = period.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Normaliza una descripcion para comparar comercios: sin acentos, sin ruido de
 * numeros de cuota ni sucursal. Es la base del fingerprint anti-duplicados y
 * del match deterministico de merchant_rules.
 */
export function normalizeMerchant(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bC\.?\s?\d{2}\/\d{2}\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
