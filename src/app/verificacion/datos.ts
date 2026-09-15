/**
 * Datos inventados con la forma real, para mirar las pantallas sin base.
 *
 * Los textos son largos a proposito: lo que desborda o trunca mal es siempre el
 * texto largo, nunca el corto. Y no sale de ningun resumen: en el repo no va
 * ningun dato real, solo la logica de como leerlos.
 */
import type { Account, Category, Transaction } from "@/lib/data";
import type { Currency } from "@/lib/domain";
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

export const movimientos: Transaction[] = DESCS.map((description, i) => ({
  id: `t${i}`,
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
