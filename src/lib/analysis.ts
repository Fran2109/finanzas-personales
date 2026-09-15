/**
 * Comparaciones entre meses.
 *
 * El calendario de compromisos mira para adelante; esto mira para atras, que es
 * lo unico que contesta "en que cambie".
 */
import type { Currency, Period } from "./domain.ts";
import type { Cents } from "./money.ts";

/** Lo minimo de un movimiento para comparar meses. */
export type PeriodRow = {
  period: Period;
  amount: Cents;
  currency: Currency;
  categoryName: string;
  isProjected: boolean;
};

export type CategoryDelta = {
  label: string;
  before: Cents;
  after: Cents;
  /** after - before. Positivo = gastaste mas que el mes anterior. */
  delta: Cents;
};

/**
 * Que subio y que bajo entre dos meses, por categoria.
 *
 * Incluye las categorias que aparecen en uno solo de los dos meses: que algo
 * arranque de cero o desaparezca es justamente lo que se quiere ver, y
 * filtrarlas dejaria afuera los cambios mas grandes.
 */
export function categoryDeltas(
  rows: PeriodRow[],
  before: Period,
  after: Period,
  currency: Currency = "ARS",
): CategoryDelta[] {
  const antes = new Map<string, Cents>();
  const despues = new Map<string, Cents>();

  for (const row of rows) {
    if (row.currency !== currency) continue;
    const destino = row.period === before ? antes : row.period === after ? despues : null;
    if (!destino) continue;
    destino.set(row.categoryName, (destino.get(row.categoryName) ?? 0) + row.amount);
  }

  const categorias = new Set([...antes.keys(), ...despues.keys()]);
  return [...categorias]
    .map((label) => {
      const a = antes.get(label) ?? 0;
      const d = despues.get(label) ?? 0;
      return { label, before: a, after: d, delta: d - a };
    })
    .filter((c) => c.delta !== 0)
    // Lo que mas se movio primero, sin importar para que lado: la pregunta es
    // "que cambio", no "que subio".
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Los periodos que tienen movimientos, del mas nuevo al mas viejo. */
export function periodsOf(rows: PeriodRow[]): Period[] {
  return [...new Set(rows.map((r) => r.period))].sort().reverse();
}

/**
 * Si un mes todavia puede cambiar.
 *
 * Un mes con movimientos provisorios sale de una lista pegada del home banking
 * y el resumen no cerro: compararlo contra meses cerrados como si fuera una
 * tendencia es leer de mas.
 */
export function isProvisional(rows: PeriodRow[], period: Period): boolean {
  return rows.some((r) => r.period === period && r.isProjected);
}
