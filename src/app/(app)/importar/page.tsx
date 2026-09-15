import { UploadStatementForm } from "@/components/UploadStatementForm";
import { PasteStatementForm } from "@/components/PasteStatementForm";
import { StatementRow, type ImportedStatement } from "@/components/StatementRow";
import { getAccounts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { insignia, lista, vacio } from "@/components/ui/estilos";
import { Aviso } from "@/components/ui/Aviso";

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
      .from("finanzas_imports")
      .select(
        "id, filename, period_close, status, provisional, declared_total_ars, declared_total_usd, created_at, account:finanzas_accounts(name)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("finanzas_transactions").select("import_id").not("import_id", "is", null),
  ]);

  // Cuantos movimientos dejo cada resumen: es lo que se pierde al borrarlo.
  const porImport = new Map<string, number>();
  for (const row of movimientos.data ?? []) {
    if (!row.import_id) continue;
    porImport.set(row.import_id, (porImport.get(row.import_id) ?? 0) + 1);
  }

  const resumenes = (imports.data ?? []) as unknown as ImportedStatement[];
  const activas = accounts.filter((a) => a.active);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Importar</h1>

      <section>
        <h2 className="mb-1 text-base font-semibold">Subir resumen cerrado</h2>
        <p className="mb-3 text-sm text-muted">
          El PDF que manda el banco. Es el dato definitivo.
        </p>
        <UploadStatementForm accounts={activas} />
      </section>

      {/* Sin caja: el borde punteado que tenia decia "aca falta algo" cuando es
          una de las dos formas de cargar. Que sea provisorio ya lo dicen la
          insignia y la bajada, y el aire alcanza para separarla de la de
          arriba. */}
      <section>
        <h2 className="mb-1 flex flex-wrap items-center gap-2 text-base font-semibold">
          Adelantar el mes en curso
          <span className={insignia}>provisorio</span>
        </h2>
        <p className="mb-3 text-sm text-muted">
          El resumen todavía no cerró y no hay PDF, pero los consumos ya están en
          el home banking. Pegá la tabla y mirá cómo viene el mes. Cuando llegue
          el PDF real, lo que cargues acá se reemplaza solo.
        </p>
        <PasteStatementForm accounts={activas} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Resumenes importados</h2>

        {error ? (
          <Aviso tono="negativo" className="mb-3">
            {error}
          </Aviso>
        ) : null}

        {resumenes.length === 0 ? (
          <p className={vacio}>Todavia no subiste ningun resumen.</p>
        ) : (
          <ul className={lista}>
            {resumenes.map((imp) => (
              <StatementRow key={imp.id} imp={imp} movimientos={porImport.get(imp.id) ?? 0} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
