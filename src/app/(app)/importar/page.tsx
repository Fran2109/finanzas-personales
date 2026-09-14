import Link from "next/link";

import { UploadStatementForm } from "@/components/UploadStatementForm";
import { PasteStatementForm } from "@/components/PasteStatementForm";
import { DeleteImportButton } from "@/components/DeleteImportButton";
import { getAccounts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { centsFromDb, formatCents } from "@/lib/money";

const STATUS_LABELS: Record<string, string> = {
  pending: "Sin reconciliar",
  reconciled: "Listo para revisar",
  rejected: "Rechazado",
  committed: "Importado",
};

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [accounts, imports, movimientos] = await Promise.all([
    getAccounts(),
    supabase
      .from("imports")
      .select(
        "id, filename, period_close, status, provisional, declared_total_ars, declared_total_usd, created_at, account:accounts(name)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("transactions").select("import_id").not("import_id", "is", null),
  ]);

  // Cuantos movimientos dejo cada resumen: es lo que se pierde al borrarlo.
  const porImport = new Map<string, number>();
  for (const row of movimientos.data ?? []) {
    if (!row.import_id) continue;
    porImport.set(row.import_id, (porImport.get(row.import_id) ?? 0) + 1);
  }

  const lista = imports.data ?? [];

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Importar</h1>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Subir resumen cerrado</h2>
        <p className="mb-3 text-xs text-muted">
          El PDF que manda el banco. Es el dato definitivo.
        </p>
        <UploadStatementForm accounts={accounts.filter((a) => a.active)} />
      </section>

      <section className="rounded-lg border border-dashed border-border p-4">
        <h2 className="mb-1 text-sm font-semibold">
          Adelantar el mes en curso{" "}
          <span className="ml-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent align-middle">
            provisorio
          </span>
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          El resumen todavía no cerró y no hay PDF, pero los consumos ya están en
          el home banking. Pegá la tabla y mirá cómo viene el mes. Cuando llegue
          el PDF real, lo que cargues acá se reemplaza solo.
        </p>
        <PasteStatementForm accounts={accounts.filter((a) => a.active)} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Resumenes importados</h2>

        {error ? (
          <p className="mb-3 rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
            {error}
          </p>
        ) : null}

        {lista.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Todavia no subiste ningun resumen.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {lista.map((imp) => {
              const count = porImport.get(imp.id) ?? 0;
              return (
                <li key={imp.id} className="flex flex-wrap items-center gap-3 px-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/importar/${imp.id}`} className="truncate hover:underline">
                      {imp.filename}
                    </Link>
                    {imp.provisional ? (
                      <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                        provisorio
                      </span>
                    ) : null}
                    <div className="text-xs text-muted">
                      {[
                        (imp.account as unknown as { name: string } | null)?.name,
                        imp.period_close,
                        STATUS_LABELS[imp.status] ?? imp.status,
                        count > 0 ? `${count} movimientos` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <span className="tabular shrink-0 text-right">
                    <span className="block">
                      {formatCents(centsFromDb(imp.declared_total_ars))}
                    </span>
                    {/* Sin fx_rates cargadas no hay cotizacion honesta: los
                        dolares se muestran aparte, nunca pesificados. */}
                    {centsFromDb(imp.declared_total_usd) !== 0 ? (
                      <span className="block text-xs text-muted">
                        {formatCents(centsFromDb(imp.declared_total_usd), "USD")}
                      </span>
                    ) : null}
                  </span>
                  <DeleteImportButton importId={imp.id} transactionCount={count} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </div>
  );
}
