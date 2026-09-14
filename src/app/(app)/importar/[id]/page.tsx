import Link from "next/link";
import { notFound } from "next/navigation";

import { Amount } from "@/components/Amount";
import { commitImport, deleteImport, discardRow, setRowCategory } from "@/app/import-actions";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data";
import { KIND_LABELS, type Kind } from "@/lib/domain";
import { centsFromDb } from "@/lib/money";

/** Que categorias tienen sentido segun el tipo de movimiento. */
const CATEGORY_KIND_FOR: Record<Kind, string> = {
  consumption: "expense",
  refund: "expense",
  income: "income",
  tax_fee: "tax_fee",
  financing: "financing",
  transfer: "transfer",
  payment: "transfer",
};

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
  const [imported, rowsResult, categories] = await Promise.all([
    supabase.from("imports").select("*").eq("id", id).single(),
    supabase.from("import_rows").select("*").eq("import_id", id).order("line_no"),
    getCategories(),
  ]);

  if (imported.error || !imported.data) notFound();

  const rows = rowsResult.data ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const porRevisar = pending.filter((r) => r.needs_review);
  const yaImportado = imported.data.status === "committed";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{imported.data.filename}</h1>
          <p className="text-sm text-muted">
            Cierre {imported.data.period_close ?? "?"} · {rows.length} filas ·{" "}
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
          {pending.length - porRevisar.length})
        </h2>
        <RowTable
          rows={pending.filter((r) => !r.needs_review)}
          categories={categories}
          importId={id}
          readOnly={yaImportado}
        />
      </section>

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
          <form action={deleteImport} className="ml-auto">
            <input type="hidden" name="import_id" value={id} />
            <button type="submit" className="text-sm text-muted hover:text-negative">
              Descartar import
            </button>
          </form>
        </div>
      ) : null}
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
        const opciones = categories.filter((c) => c.kind === CATEGORY_KIND_FOR[kind]);
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
              <form action={setRowCategory} className="flex shrink-0 items-center gap-2">
                <input type="hidden" name="row_id" value={row.id} />
                <input type="hidden" name="import_id" value={importId} />
                <select
                  name="category_id"
                  defaultValue={row.suggested_category_id ?? ""}
                  className="w-44 rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">Sin categoria</option>
                  {opciones.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
                >
                  Guardar
                </button>
              </form>
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
