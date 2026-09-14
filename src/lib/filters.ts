import { normalizeMerchant, type Currency, type Kind } from "./domain.ts";

/** Lo que el filtro necesita mirar de un movimiento. */
export type Filterable = {
  kind: Kind;
  currency: Currency;
  card_last4: string | null;
  description: string | null;
  account: { id: string } | null;
  category: { id: string } | null;
};

/**
 * Filtros de la vista del mes.
 *
 * Viajan en la URL, asi que una vista filtrada se puede guardar en favoritos o
 * volver con el boton de atras. Un valor vacio significa "todos".
 */
export type Filters = {
  cuenta: string;
  categoria: string;
  tipo: string;
  plastico: string;
  moneda: string;
  q: string;
};

export const EMPTY_FILTERS: Filters = {
  cuenta: "",
  categoria: "",
  tipo: "",
  plastico: "",
  moneda: "",
  q: "",
};

export const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof Filters)[];

/** Marca especial: movimientos a los que nadie les puso categoria. */
export const SIN_CATEGORIA = "sin";

export function readFilters(params: Record<string, string | undefined>): Filters {
  const out = { ...EMPTY_FILTERS };
  for (const key of FILTER_KEYS) out[key] = (params[key] ?? "").trim();
  return out;
}

export function hasActiveFilters(filters: Filters): boolean {
  return FILTER_KEYS.some((key) => filters[key] !== "");
}

export function applyFilters<T extends Filterable>(rows: T[], filters: Filters): T[] {
  // La busqueda se normaliza igual que las descripciones, asi "cafe" encuentra
  // "CAFÉ" y "comercio uno" encuentra "PVS*COMERCIO UNO".
  const termino = filters.q ? normalizeMerchant(filters.q) : "";

  return rows.filter((row) => {
    if (filters.cuenta && row.account?.id !== filters.cuenta) return false;
    if (filters.tipo && row.kind !== filters.tipo) return false;
    if (filters.moneda && row.currency !== filters.moneda) return false;
    if (filters.plastico && row.card_last4 !== filters.plastico) return false;

    if (filters.categoria) {
      const id = row.category?.id ?? SIN_CATEGORIA;
      if (id !== filters.categoria) return false;
    }

    if (termino && !normalizeMerchant(row.description ?? "").includes(termino)) {
      return false;
    }

    return true;
  });
}

/** Query string de la vista del mes, con los filtros que esten puestos. */
export function monthQuery(period: string, filters: Filters): string {
  const params = new URLSearchParams({ mes: period });
  for (const key of FILTER_KEYS) {
    if (filters[key]) params.set(key, filters[key]);
  }
  return params.toString();
}
