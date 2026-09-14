"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { KIND_LABELS, MANUAL_KINDS } from "@/lib/domain";
import { FILTER_KEYS, SIN_CATEGORIA, type Filters } from "@/lib/filters";

const control =
  "rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent";

/**
 * Filtros de la vista del mes.
 *
 * El estado vive en la URL y no en el componente: asi una vista filtrada se
 * comparte, se guarda en favoritos y el boton de atras hace lo esperable. Los
 * valores actuales llegan por props desde el servidor, que ya los leyo de la
 * query.
 */
export function MonthFilters({
  period,
  filters,
  accounts,
  categories,
  cards,
  shown,
  total,
}: {
  period: string;
  filters: Filters;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  cards: string[];
  shown: number;
  total: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);

  function navigate(next: Partial<Filters>) {
    const params = new URLSearchParams({ mes: period });
    const merged = { ...filters, ...next };
    for (const key of FILTER_KEYS) {
      if (merged[key]) params.set(key, merged[key]);
    }
    router.push(`/?${params.toString()}`);
  }

  const activos = FILTER_KEYS.filter((k) => filters[k] !== "").length;

  return (
    <section className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ q });
          }}
          className="contents"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar comercio..."
            aria-label="Buscar"
            className={`${control} min-w-40 flex-1`}
          />
        </form>

        {accounts.length > 1 ? (
          <select
            value={filters.cuenta}
            onChange={(e) => navigate({ cuenta: e.target.value })}
            aria-label="Cuenta"
            className={control}
          >
            <option value="">Toda cuenta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={filters.categoria}
          onChange={(e) => navigate({ categoria: e.target.value })}
          aria-label="Categoria"
          className={control}
        >
          <option value="">Toda categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={SIN_CATEGORIA}>Sin categoria</option>
        </select>

        <select
          value={filters.tipo}
          onChange={(e) => navigate({ tipo: e.target.value })}
          aria-label="Tipo"
          className={control}
        >
          <option value="">Todo tipo</option>
          {MANUAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>

        {cards.length > 1 ? (
          <select
            value={filters.plastico}
            onChange={(e) => navigate({ plastico: e.target.value })}
            aria-label="Plastico"
            className={control}
          >
            <option value="">Todo plastico</option>
            {cards.map((c) => (
              <option key={c} value={c}>
                *{c}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={filters.moneda}
          onChange={(e) => navigate({ moneda: e.target.value })}
          aria-label="Moneda"
          className={control}
        >
          <option value="">Toda moneda</option>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {activos > 0 ? (
        <p className="mt-2 flex items-center gap-3 text-xs text-muted">
          {/* Con filtros puestos los totales son los del subconjunto, no los
              del mes: decirlo evita leer un numero por otro. */}
          <span>
            Mostrando {shown} de {total} movimientos. Los totales son de lo
            filtrado.
          </span>
          <button
            type="button"
            onClick={() => {
              setQ("");
              router.push(`/?mes=${period}`);
            }}
            className="text-accent hover:underline"
          >
            Limpiar
          </button>
        </p>
      ) : null}
    </section>
  );
}
