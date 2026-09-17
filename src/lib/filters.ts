import { normalizeMerchant, type Currency, type Kind } from "./domain.ts";

/** Lo que el filtro necesita mirar de un movimiento. */
export type Filterable = {
  kind: Kind;
  currency: Currency;
  description: string | null;
  nota: string | null;
  account: { id: string } | null;
  category: { id: string } | null;
};

/**
 * Filtros de la vista del mes.
 *
 * Viajan en la URL, asi que una vista filtrada se puede guardar en favoritos o
 * volver con el boton de atras.
 *
 * Cada filtro es una lista y no un valor: "efectivo y banco" o "comida y
 * super" son preguntas normales, y con un solo valor habia que mirarlas de a
 * una y sumar a mano. Una lista vacia significa "todos", que es lo mismo que
 * elegirlos a todos pero no ensucia la URL.
 */
export type Filters = {
  cuenta: string[];
  categoria: string[];
  tipo: string[];
  moneda: string[];
  nota: string[];
  q: string;
};

/** Los filtros de lista. `q` va aparte porque es texto libre. */
export const MULTI_KEYS = ["cuenta", "categoria", "tipo", "moneda", "nota"] as const;
export type MultiKey = (typeof MULTI_KEYS)[number];

export const EMPTY_FILTERS: Filters = {
  cuenta: [],
  categoria: [],
  tipo: [],
  moneda: [],
  nota: [],
  q: "",
};

/** Marca especial: movimientos a los que nadie les puso categoria. */
export const SIN_CATEGORIA = "sin";

/**
 * Los dos valores del filtro de nota.
 *
 * Es una lista como los demas y no un booleano, y eso no es por simetria: con
 * una lista, "los dos" y "ninguno" son el mismo estado —todos— y se escribe
 * solo. Un booleano de tres estados (si / no / cualquiera) habria necesitado su
 * propia lectura de la URL, su propio "que pasa si dice cualquier otra cosa" y
 * su propia rama en `monthQuery`.
 */
export const CON_NOTA = "con";
export const SIN_NOTA = "sin";

/**
 * Una lista de la URL: "a,b,c".
 *
 * La URL la puede escribir cualquiera —se comparte, se edita a mano, queda en
 * favoritos— asi que se saca lo vacio y lo repetido en vez de confiar.
 */
function readList(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
}

export function readFilters(params: Record<string, string | undefined>): Filters {
  return {
    cuenta: readList(params.cuenta),
    categoria: readList(params.categoria),
    tipo: readList(params.tipo),
    moneda: readList(params.moneda),
    nota: readList(params.nota),
    q: (params.q ?? "").trim(),
  };
}

export function hasActiveFilters(filters: Filters): boolean {
  return MULTI_KEYS.some((key) => filters[key].length > 0) || filters.q !== "";
}

/** Cuantos filtros estan puestos, para decidir si hace falta avisar. */
export function countActiveFilters(filters: Filters): number {
  return MULTI_KEYS.filter((key) => filters[key].length > 0).length + (filters.q ? 1 : 0);
}

export function applyFilters<T extends Filterable>(rows: T[], filters: Filters): T[] {
  // La busqueda se normaliza igual que las descripciones, asi "cafe" encuentra
  // "CAFÉ" y "comercio uno" encuentra "PVS*COMERCIO UNO".
  const termino = filters.q ? normalizeMerchant(filters.q) : "";

  return rows.filter((row) => {
    // Lista vacia es "todos": no filtra nada. Con valores, alcanza con que el
    // movimiento coincida con alguno.
    if (filters.cuenta.length > 0 && !filters.cuenta.includes(row.account?.id ?? "")) {
      return false;
    }
    if (filters.tipo.length > 0 && !filters.tipo.includes(row.kind)) return false;
    if (filters.moneda.length > 0 && !filters.moneda.includes(row.currency)) return false;

    if (filters.categoria.length > 0) {
      const id = row.category?.id ?? SIN_CATEGORIA;
      if (!filters.categoria.includes(id)) return false;
    }

    // Una nota en blanco o de puros espacios es no tener nota: `leerNota`
    // guarda `null` en ese caso, pero la fila pudo entrar por otro camino y
    // "sin nota" tiene que encontrarla igual.
    if (filters.nota.length > 0) {
      const tiene = row.nota?.trim() ? CON_NOTA : SIN_NOTA;
      if (!filters.nota.includes(tiene)) return false;
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
  for (const key of MULTI_KEYS) {
    if (filters[key].length > 0) params.set(key, filters[key].join(","));
  }
  if (filters.q) params.set("q", filters.q);
  return params.toString();
}
