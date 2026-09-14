"use client";

import { useMemo, useState } from "react";

import { setRowCategory } from "@/app/import-actions";
import {
  CATEGORY_KIND_FOR,
  KIND_LABELS,
  MANUAL_KINDS,
  type Kind,
} from "@/lib/domain";

/**
 * Tipo y categoria de una fila del resumen, en un solo formulario.
 *
 * Van juntos porque el tipo manda: las categorias que se ofrecen dependen de
 * el, asi que cambiarlo sin poder corregir la categoria en el mismo paso
 * dejaria la fila imputada a una categoria que ya no le corresponde.
 *
 * El parser acierta el tipo casi siempre, pero cuando se equivoca no habia
 * forma de corregirlo desde aca: un impuesto leido como compra distorsionaba
 * el analisis por categoria y no habia mas remedio que borrar el import.
 */
export function RowCategorySelect({
  rowId,
  categories,
  defaultKind,
  defaultValue,
}: {
  rowId: string;
  categories: { id: string; name: string; kind: string }[];
  defaultKind: Kind;
  defaultValue: string;
}) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [creating, setCreating] = useState(false);

  const opciones = useMemo(
    () => categories.filter((c) => c.kind === CATEGORY_KIND_FOR[kind]),
    [categories, kind],
  );

  return (
    <form action={setRowCategory} className="flex shrink-0 flex-wrap items-center gap-2">
      <input type="hidden" name="row_id" value={rowId} />
      <input type="hidden" name="category_kind" value={CATEGORY_KIND_FOR[kind]} />

      <select
        name="kind"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as Kind);
          // La categoria elegida pertenece a la familia del tipo anterior.
          setCreating(false);
        }}
        aria-label="Tipo de movimiento"
        className="w-36 rounded-md border border-border bg-background px-2 py-1 text-xs"
      >
        {MANUAL_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>

      {creating ? (
        <input
          name="new_category"
          required
          autoFocus
          placeholder="Seguros"
          aria-label="Nombre de la categoria nueva"
          className="w-44 rounded-md border border-accent bg-background px-2 py-1 text-xs"
        />
      ) : (
        <select
          name="category_id"
          // Al cambiar el tipo, la key remonta el select y la eleccion anterior
          // se descarta, que es justo lo que hay que hacer con ella.
          key={kind}
          defaultValue={kind === defaultKind ? defaultValue : ""}
          onChange={(e) => {
            if (e.target.value === "__nueva__") setCreating(true);
          }}
          aria-label="Categoria"
          className="w-44 rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">Sin categoria</option>
          {opciones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__nueva__">+ Nueva categoria...</option>
        </select>
      )}

      <button
        type="submit"
        className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
      >
        Guardar
      </button>

      {creating ? (
        <button
          type="button"
          onClick={() => setCreating(false)}
          aria-label="Cancelar categoria nueva"
          className="text-xs text-muted hover:text-foreground"
        >
          Cancelar
        </button>
      ) : null}
    </form>
  );
}
