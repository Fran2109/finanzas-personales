"use client";

import { useState } from "react";

import { setRowCategory } from "@/app/import-actions";

/**
 * Selector de categoria de una fila del resumen.
 *
 * Las opciones se filtran por el tipo del movimiento: un consumo solo puede ir
 * a una categoria de gasto. Sin ese filtro nada impediria imputar una compra a
 * "Sueldo", y el analisis por categoria dejaria de significar algo.
 */
export function RowCategorySelect({
  rowId,
  categories,
  categoryKind,
  defaultValue,
}: {
  rowId: string;
  categories: { id: string; name: string }[];
  categoryKind: string;
  defaultValue: string;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <form action={setRowCategory} className="flex shrink-0 items-center gap-2">
      <input type="hidden" name="row_id" value={rowId} />
      <input type="hidden" name="category_kind" value={categoryKind} />

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
          defaultValue={defaultValue}
          onChange={(e) => {
            if (e.target.value === "__nueva__") setCreating(true);
          }}
          className="w-44 rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">Sin categoria</option>
          {categories.map((c) => (
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
