import Link from "next/link";

import { UploadStatementForm } from "@/components/UploadStatementForm";
import { getAccounts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";

const STATUS_LABELS: Record<string, string> = {
  pending: "Sin reconciliar",
  reconciled: "Listo para revisar",
  rejected: "Rechazado",
  committed: "Importado",
};

export default async function ImportsPage() {
  const supabase = await createClient();
  const [accounts, imports] = await Promise.all([
    getAccounts(),
    supabase
      .from("imports")
      .select("id, filename, period_close, status, declared_total_ars, created_at")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <section>
        <h1 className="mb-3 text-lg font-semibold">Resumenes importados</h1>
        {(imports.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Todavia no subiste ningun resumen.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {(imports.data ?? []).map((imp) => (
              <li key={imp.id} className="flex items-center gap-3 px-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/importar/${imp.id}`} className="truncate hover:underline">
                    {imp.filename}
                  </Link>
                  <div className="text-xs text-muted">
                    {[imp.period_close, STATUS_LABELS[imp.status] ?? imp.status]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <span className="tabular text-sm">
                  {formatCents(Math.round(Number(imp.declared_total_ars ?? 0) * 100))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside>
        <h2 className="mb-3 text-sm font-semibold">Subir resumen</h2>
        <UploadStatementForm accounts={accounts.filter((a) => a.active)} />
      </aside>
    </div>
  );
}
