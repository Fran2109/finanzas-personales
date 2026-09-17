import { Amount } from "@/components/Amount";
import { discardRow } from "@/app/import-actions";
import { RowCategorySelect } from "@/components/RowCategorySelect";
import { KIND_LABELS, type Kind } from "@/lib/domain";
import type { NotasPorCategoria } from "@/lib/data";
import { centsFromDb } from "@/lib/money";
import { botonIcono, lista } from "@/components/ui/estilos";

export type ImportRow = {
  id: string;
  occurred_on: string | null;
  raw_description: string;
  amount: number;
  currency: string;
  kind: string;
  card_last4: string | null;
  cuota_current: number | null;
  cuota_total: number | null;
  suggested_category_id: string | null;
  nota: string | null;
};

/**
 * Las lineas transcritas del resumen, con su tipo y su categoria.
 *
 * Vivia adentro de la pagina, y por eso el banco de pruebas tenia una **copia a
 * mano** de este markup: justo la trampa que ya hizo mirar capturas de algo que
 * no existia. Aca el banco renderiza la fila de verdad.
 */
export function ImportRowList({
  rows,
  categories,
  notas,
  importId,
  readOnly = false,
}: {
  rows: ImportRow[];
  categories: { id: string; name: string; kind: Kind }[];
  notas: NotasPorCategoria;
  importId: string;
  readOnly?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Nada por acá.</p>;
  }

  return (
    <ul className={lista}>
      {rows.map((row) => {
        const kind = row.kind as Kind;
        return (
          <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
            <span className="tabular w-14 shrink-0 text-xs text-muted">
              {row.occurred_on?.slice(5)}
            </span>
            <div className="min-w-0 flex-1">
              {/* Al reves que en la vista del mes, aca manda el texto del
                  resumen: esta pantalla existe para contrastar la
                  transcripcion contra el PDF, y la nota adelante taparia justo
                  lo que hay que verificar. Ademas la nota ya esta a la vista en
                  su propio campo — salvo en una fila ya importada, que no lo
                  tiene, y ahi si se muestra. */}
              <div className="truncate">
                {row.raw_description}
                {readOnly && row.nota ? (
                  <span className="text-muted"> · {row.nota}</span>
                ) : null}
              </div>
              <div className="text-xs text-muted">
                {[
                  kind !== "consumption" ? KIND_LABELS[kind] : null,
                  row.card_last4 ? `*${row.card_last4}` : null,
                  row.cuota_current ? `cuota ${row.cuota_current}/${row.cuota_total}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || " "}
              </div>
            </div>
            <Amount
              cents={centsFromDb(row.amount)}
              currency={row.currency}
              tone="auto"
              className="shrink-0"
            />
            {readOnly ? (
              <span className="w-full text-xs text-muted sm:w-44 sm:shrink-0 sm:text-right">
                {categories.find((c) => c.id === row.suggested_category_id)?.name ??
                  "Sin categoria"}
              </span>
            ) : (
              <RowCategorySelect
                // Remonta el selector cuando cambia lo guardado, asi despues de
                // un save siempre muestra lo que quedo en la base y no la
                // eleccion local que lo produjo.
                key={`${row.kind}-${row.suggested_category_id ?? ""}-${row.nota ?? ""}`}
                rowId={row.id}
                categories={categories}
                notas={notas}
                defaultKind={kind}
                defaultValue={row.suggested_category_id ?? ""}
                defaultNota={row.nota ?? ""}
              />
            )}
            {!readOnly ? (
              <form action={discardRow}>
                <input type="hidden" name="row_id" value={row.id} />
                <input type="hidden" name="import_id" value={importId} />
                <button type="submit" aria-label="Descartar fila" className={botonIcono}>
                  &times;
                </button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
