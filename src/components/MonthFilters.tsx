"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MultiSelect } from "@/components/MultiSelect";
import { KIND_LABELS, MANUAL_KINDS } from "@/lib/domain";
import {
  countActiveFilters,
  monthQuery,
  SIN_CATEGORIA,
  type Filters,
} from "@/lib/filters";

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
  shown,
  total,
}: {
  period: string;
  filters: Filters;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  shown: number;
  total: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);

  function navigate(next: Partial<Filters>) {
    router.push(`/?${monthQuery(period, { ...filters, ...next })}`);
  }

  const activos = countActiveFilters(filters);

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
          <MultiSelect
            etiqueta="Cuenta"
            todos="Toda cuenta"
            plural="cuentas"
            opciones={accounts.map((a) => ({ value: a.id, label: a.name }))}
            seleccion={filters.cuenta}
            onChange={(cuenta) => navigate({ cuenta })}
          />
        ) : null}

        <MultiSelect
          etiqueta="Categoria"
          todos="Toda categoria"
          plural="categorias"
          opciones={[
            ...categories.map((c) => ({ value: c.id, label: c.name })),
            { value: SIN_CATEGORIA, label: "Sin categoria" },
          ]}
          seleccion={filters.categoria}
          onChange={(categoria) => navigate({ categoria })}
        />

        <MultiSelect
          etiqueta="Tipo"
          todos="Todo tipo"
          plural="tipos"
          opciones={MANUAL_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
          seleccion={filters.tipo}
          onChange={(tipo) => navigate({ tipo })}
        />

        <MultiSelect
          etiqueta="Moneda"
          todos="Toda moneda"
          plural="monedas"
          opciones={[
            { value: "ARS", label: "ARS" },
            { value: "USD", label: "USD" },
          ]}
          seleccion={filters.moneda}
          onChange={(moneda) => navigate({ moneda })}
        />
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
