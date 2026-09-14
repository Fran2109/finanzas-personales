import Link from "next/link";
import { notFound } from "next/navigation";

import { Amount } from "@/components/Amount";
import { commitImport, discardRow } from "@/app/import-actions";
import { RowCategorySelect } from "@/components/RowCategorySelect";
import { DeleteImportButton } from "@/components/DeleteImportButton";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data";
import { KIND_LABELS, type Kind } from "@/lib/domain";
import { centsFromDb } from "@/lib/money";

export default async function ReviewImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const [imported, rowsResult, categories, movimientos] = await Promise.all([
    supabase.from("imports").select("*").eq("id", id).single(),
    supabase.from("import_rows").select("*").eq("import_id", id).order("line_no"),
    getCategories(),
    // Una vez confirmado, las filas de staging pasan a "accepted": lo que este
    // resumen dejo en las cuentas hay que contarlo en transactions.
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("import_id", id),
  ]);

  if (imported.error || !imported.data) notFound();

  const rows = rowsResult.data ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  // Lo que el resumen trae pero no es un gasto: el pago, las transferencias.
  // Se muestran para que se vea que la transcripcion esta completa.
  const descartadas = rows.filter((r) => r.status === "discarded");
  const porRevisar = pending.filter((r) => r.needs_review);
  const yaImportado = imported.data.status === "committed";
  const movimientosCreados = movimientos.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{imported.data.filename}</h1>
          <p className="text-sm text-muted">
            Cierre {imported.data.period_close ?? "?"} · {rows.length} filas leidas ·{" "}
            {pending.length} gastos ·{" "}
            {yaImportado ? "ya importado" : `${porRevisar.length} por revisar`}
          </p>
        </div>
        <Link href="/importar" className="text-sm text-muted hover:text-foreground">
          Volver
        </Link>
      </div>

      {error ? (
        <p className="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      ) : null}

      <div className="rounded-lg border border-positive/40 bg-positive/10 px-3 py-2 text-sm">
        <strong className="text-positive">Reconcilia.</strong>{" "}
        <span className="text-muted">
          La suma de las filas da el total declarado, al centavo, en cada moneda.
        </span>
      </div>

      {porRevisar.length > 0 ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold">
            Por revisar ({porRevisar.length})
          </h2>
          <p className="mb-3 text-xs text-muted">
            Lo que categorices acá se guarda como regla: el próximo resumen lo
            mapea solo.
          </p>
          <RowTable rows={porRevisar} categories={categories} importId={id} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold">
          {porRevisar.length > 0 ? "Ya mapeadas" : "Movimientos"} (
          {yaImportado ? movimientosCreados : pending.length - porRevisar.length})
        </h2>
        <RowTable
          rows={(yaImportado ? rows.filter((r) => r.status === "accepted") : pending).filter(
            (r) => !r.needs_review,
          )}
          categories={categories}
          importId={id}
          readOnly={yaImportado}
        />
      </section>

      {descartadas.length > 0 ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-muted">
            No se importan ({descartadas.length})
          </h2>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            El resumen las trae y hacen falta para que reconcilie, pero no son
            gastos: el pago mueve plata entre cuentas propias y ese consumo ya
            esta contado en las lineas de arriba.
          </p>
          <ul className="divide-y divide-border rounded-lg border border-dashed border-border">
            {descartadas.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 px-3 py-2 text-sm text-muted"
              >
                <span className="tabular w-14 shrink-0 text-xs">
                  {row.occurred_on?.slice(5)}
                </span>
                <span className="min-w-0 flex-1 truncate">{row.raw_description}</span>
                <span className="shrink-0 text-xs">
                  {KIND_LABELS[row.kind as Kind]}
                </span>
                <Amount
                  cents={centsFromDb(row.amount)}
                  currency={row.currency}
                  className="shrink-0"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!yaImportado ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <form action={commitImport}>
            <input type="hidden" name="import_id" value={id} />
            <button
              type="submit"
              disabled={porRevisar.length > 0}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
            >
              Confirmar e importar {pending.length} movimientos
            </button>
          </form>
          {porRevisar.length > 0 ? (
            <span className="text-xs text-muted">
              Falta categorizar {porRevisar.length}.
            </span>
          ) : null}
          <div className="ml-auto">
            <DeleteImportButton
              importId={id}
              transactionCount={0}
              label="Descartar resumen"
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <span className="text-sm text-muted">
            Ya importado: {movimientosCreados} movimientos en tus cuentas.
          </span>
          <div className="ml-auto">
            <DeleteImportButton
              importId={id}
              transactionCount={movimientosCreados}
              label="Borrar resumen y sus movimientos"
            />
          </div>
        </div>
      )}
    </div>
  );
}

type Row = {
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
};

function RowTable({
  rows,
  categories,
  importId,
  readOnly = false,
}: {
  rows: Row[];
  categories: { id: string; name: string; kind: Kind }[];
  importId: string;
  readOnly?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Nada por acá.</p>;
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {rows.map((row) => {
        const kind = row.kind as Kind;
        return (
          <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
            <span className="tabular w-14 shrink-0 text-xs text-muted">
              {row.occurred_on?.slice(5)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate">{row.raw_description}</div>
              <div className="text-xs text-muted">
                {[
                  kind !== "consumption" ? KIND_LABELS[kind] : null,
                  row.card_last4 ? `*${row.card_last4}` : null,
                  row.cuota_current ? `cuota ${row.cuota_current}/${row.cuota_total}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || " "}
              </div>
            </div>
            <Amount
              cents={centsFromDb(row.amount)}
              currency={row.currency}
              tone="auto"
              className="shrink-0"
            />
            {readOnly ? (
              <span className="w-44 shrink-0 text-right text-xs text-muted">
                {categories.find((c) => c.id === row.suggested_category_id)?.name ??
                  "Sin categoria"}
              </span>
            ) : (
              <RowCategorySelect
                // Remonta el selector cuando cambia lo guardado, asi despues de
                // un save siempre muestra lo que quedo en la base y no la
                // eleccion local que lo produjo.
                key={`${row.kind}-${row.suggested_category_id ?? ""}`}
                rowId={row.id}
                categories={categories}
                defaultKind={kind}
                defaultValue={row.suggested_category_id ?? ""}
              />
            )}
            {!readOnly ? (
              <form action={discardRow}>
                <input type="hidden" name="row_id" value={row.id} />
                <input type="hidden" name="import_id" value={importId} />
                <button
                  type="submit"
                  aria-label="Descartar fila"
                  className="text-muted hover:text-negative"
                >
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
