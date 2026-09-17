/**
 * Datos inventados con la forma real, para mirar las pantallas sin base.
 *
 * Los textos son largos a proposito: lo que desborda o trunca mal es siempre el
 * texto largo, nunca el corto. Y no sale de ningun resumen: en el repo no va
 * ningun dato real, solo la logica de como leerlos.
 */
import type { Account, Category, NotasPorCategoria, Transaction } from "@/lib/data";
import type { Currency } from "@/lib/domain";
import type { InstallmentRow } from "@/lib/commitments";
import type { ImportRow } from "@/components/ImportRowList";
import type { ImportedStatement } from "@/components/StatementRow";
import type { Cents } from "@/lib/money";

export const MES = "2026-09";

export const cuentas: Account[] = [
  { id: "a1", name: "Banco Del Centro - MasterCard Platinum", type: "credit_card", currency: "ARS", is_liability: true, active: true },
  { id: "a2", name: "Banco Del Sur - Visa", type: "credit_card", currency: "ARS", is_liability: true, active: true },
  { id: "a3", name: "Caja de ahorro en dolares", type: "bank", currency: "USD", is_liability: false, active: false },
];

export const categorias: Category[] = [
  "Supermercado", "Transporte", "Salidas y restaurantes", "Servicios del hogar",
  "Financiacion", "Impuestos", "Salud", "Indumentaria",
].map((name, i) => ({ id: `c${i}`, name, kind: "consumption" as const }));

const DESCS = [
  "COMERCIO CON UN NOMBRE REALMENTE LARGO S.A. SUCURSAL CENTRO",
  "KIOSCO",
  "PLATAFORMA*SERVICIO-DE-SUSCRIPCION-MENSUAL",
  "FARMACIA DEL BARRIO",
  "PERCEPCION RG 4240 SOBRE CONSUMOS EN MONEDA EXTRANJERA",
  "ALMACEN",
];

/**
 * Las notas de prueba, con el caso que importa: una nota larga delante de una
 * descripcion larga, que es donde se ve si la linea aguanta en un telefono.
 */
const NOTAS = [
  "regalo de cumple de la madre de un amigo",
  null,
  "la suscripcion que siempre me olvido de dar de baja",
  null,
  null,
  "compra semanal",
];

export const movimientos: Transaction[] = DESCS.map((description, i) => ({
  id: `t${i}`,
  nota: NOTAS[i],
  occurred_on: `2026-09-0${(i % 9) + 1}`,
  amount: [1289539, 45000, 233400, 8990000, 12345678, 990][i] as Cents,
  currency: (i === 4 ? "USD" : "ARS") as Currency,
  kind: (i % 3 === 0 ? "installment" : "consumption") as Transaction["kind"],
  description,
  card_last4: i % 2 === 0 ? "1234" : null,
  is_projected: i < 2,
  fingerprint: i % 2 === 0 ? "abc" : null,
  statement_period: MES,
  created_at: "2026-09-01T00:00:00Z",
  account: { id: "a1", name: cuentas[i % 2].name, is_liability: true },
  category: { id: `c${i}`, name: categorias[i % categorias.length].name },
}));

export const summary = {
  totals: new Map<Currency, { total: Cents; purchases: Cents; installments: Cents }>([
    ["ARS", { total: 166465403, purchases: 87654321, installments: 78811082 }],
    ["USD", { total: 123456, purchases: 123456, installments: 0 }],
  ]),
  byCategory: categorias.slice(0, 6).map((c, i) => ({
    id: c.id, name: c.name, currency: "ARS" as Currency,
    total: (9000000 - i * 1200000) as Cents,
  })),
};

/**
 * Las cuotas de donde sale todo lo de Analisis.
 *
 * Se arman con las funciones reales (`openPlans`, `commitmentCalendar`...) y no
 * a mano: un fixture calculado a mano se desfasa del calculo y termina
 * mostrando una pantalla que no existe.
 */
export const cuotas: InstallmentRow[] = [
  ["Plan de refinanciacion consolidado (TNA 37,00)", "Financiacion", 51732748, 6, 12],
  ["Tienda de electrodomesticos del centro", "Celular", 8999991, 8, 12],
  ["Marketplace*vendedor-con-nombre-larguisimo", "Regalo", 7445292, 2, 6],
  ["Cuotas de una compra de verano", "Prestado", 4200241, 5, 12],
  ["Optica y accesorios", "Moto", 10950962, 1, 3],
  ["Servicio tecnico", "Regalo", 6616668, 1, 3],
  ["Muebleria", "Prestado", 28701500, 3, 3],
  ["Indumentaria deportiva", "Moto", 8843168, 2, 3],
  ["Libreria", "Regalo", 1463333, 2, 3],
].flatMap(([desc, cat, amount, actual, total]) => {
  const filas: InstallmentRow[] = [];
  for (let c = Math.max(1, (actual as number) - 2); c <= (actual as number); c++) {
    const meses = (actual as number) - c;
    const [y, m] = MES.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 - meses, 1));
    filas.push({
      accountId: cat as string,
      accountName: "Banco - Tarjeta",
      merchant: desc as string,
      description: desc as string,
      categoryName: cat as string,
      amount: amount as Cents,
      currency: "ARS",
      cuotaCurrent: c,
      cuotaTotal: total as number,
      period: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    });
  }
  return filas;
});

/** Las lineas transcritas de un resumen, como las ve la pantalla de revision. */
export const filasImportadas: ImportRow[] = DESCS.map((raw_description, i) => ({
  id: `r${i}`,
  nota: NOTAS[i],
  occurred_on: `2026-09-0${(i % 9) + 1}`,
  raw_description,
  amount: [12895.39, 450, 2334, 89900, 123456.78, 9.9][i],
  currency: i === 4 ? "USD" : "ARS",
  kind: (["consumption", "installment", "tax_fee", "financing", "refund", "consumption"] as const)[i],
  card_last4: i % 2 === 0 ? "1234" : null,
  cuota_current: i % 3 === 0 ? 6 : null,
  cuota_total: i % 3 === 0 ? 12 : null,
  suggested_category_id: i === 1 ? null : categorias[i % categorias.length].id,
}));

/** Lo que el resumen trae y no es gasto: se lista aparte, nunca se importa. */
export const filasDescartadas: ImportRow[] = [
  { kind: "payment", raw_description: "SU PAGO EN PESOS" },
  { kind: "income", raw_description: "SALDO ANTERIOR A FAVOR" },
].map((r, i) => ({
  ...filasImportadas[i],
  ...r,
  id: `d${i}`,
  cuota_current: null,
  cuota_total: null,
}));

/** El listado de resumenes ya subidos. */
export const resumenes: ImportedStatement[] = [
  { id: "i0", filename: "resumen-con-un-nombre-de-archivo-larguisimo-2026-09.pdf", period_close: "2026-09-28", status: "committed", provisional: false, declared_total_ars: 1664654.03, declared_total_usd: 1234.56, account: { name: cuentas[0].name } },
  { id: "i1", filename: "pegado-2026-09.txt", period_close: "2026-09-30", status: "reconciled", provisional: true, declared_total_ars: 233400.5, declared_total_usd: 0, account: { name: cuentas[1].name } },
  { id: "i2", filename: "resumen-2026-08.pdf", period_close: "2026-08-28", status: "rejected", provisional: false, declared_total_ars: 98765.43, declared_total_usd: 0, account: null },
];

/** Las notas ya usadas, para que el desplegable tenga algo que ofrecer. */
export const notas: NotasPorCategoria = {
  [categorias[0].id]: ["compra semanal", "kiosco", "verduleria"],
  [categorias[2].id]: ["con los del trabajo", "cumpleanos"],
};
