"use client";

import { useMemo, useState } from "react";

import { setRowCategory } from "@/app/import-actions";
import { botonBorde, campoCompacto } from "@/components/ui/estilos";
import { NotaInput } from "@/components/NotaInput";
import type { NotasPorCategoria } from "@/lib/data";
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
  notas,
  defaultKind,
  defaultValue,
  defaultNota,
}: {
  rowId: string;
  categories: { id: string; name: string; kind: string }[];
  notas: NotasPorCategoria;
  defaultKind: Kind;
  defaultValue: string;
  defaultNota: string;
}) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [creating, setCreating] = useState(false);
  // El select de categoria era no controlado, y sigue siendolo para el envio:
  // esto es solo para saber a que categoria pedirle las sugerencias de la nota.
  const [categoriaId, setCategoriaId] = useState(defaultValue);

  const opciones = useMemo(
    () => categories.filter((c) => c.kind === CATEGORY_KIND_FOR[kind]),
    [categories, kind],
  );

  // En pantalla angosta ocupa su propia linea entera y los selects se reparten
  // el ancho; recien desde sm vuelve a ser una pieza fija al lado del monto.
  // Con shrink-0 y anchos fijos sumaba ~400px que no achicaban, y eso ensanchaba
  // la fila y desbordaba la pagina entera en un telefono.
  return (
    <form
      action={setRowCategory}
      className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0"
    >
      <input type="hidden" name="row_id" value={rowId} />
      <input type="hidden" name="category_kind" value={CATEGORY_KIND_FOR[kind]} />

      <select
        name="kind"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as Kind);
          // La categoria elegida pertenece a la familia del tipo anterior.
          setCreating(false);
          setCategoriaId("");
        }}
        aria-label="Tipo de movimiento"
        className={`${campoCompacto} min-w-28 flex-1 sm:w-36 sm:flex-none`}
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
          className={`${campoCompacto} min-w-32 flex-1 border-accent sm:w-44 sm:flex-none`}
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
            else setCategoriaId(e.target.value);
          }}
          aria-label="Categoria"
          className={`${campoCompacto} min-w-32 flex-1 sm:w-44 sm:flex-none`}
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

      <NotaInput
        notas={notas}
        categoryId={categoriaId}
        defaultValue={defaultNota}
        compacto
        id={`nota-${rowId}`}
        className="min-w-32 flex-1 sm:w-44 sm:flex-none"
      />

      <button
        type="submit"
        className={botonBorde()}
      >
        Guardar
      </button>

      {creating ? (
        <button
          type="button"
          onClick={() => setCreating(false)}
          aria-label="Cancelar categoria nueva"
          className="-my-1.5 py-1.5 text-sm text-muted transition hover:text-foreground"
        >
          Cancelar
        </button>
      ) : null}
    </form>
  );
}
