import Link from "next/link";
import { notFound } from "next/navigation";

import { Amount } from "@/components/Amount";
import { commitImport } from "@/app/import-actions";
import { ImportRowList, type ImportRow } from "@/components/ImportRowList";
import { ImportAccountSelect } from "@/components/ImportAccountSelect";
import { DeleteImportButton } from "@/components/DeleteImportButton";
import { createClient } from "@/lib/supabase/server";
import { getAccounts, getCategories, getNotas } from "@/lib/data";
import {
  accountConflict,
  statementLabel,
  type StatementIdentity,
} from "@/lib/import/match-account";
import { KIND_LABELS, type Kind } from "@/lib/domain";
import { centsFromDb } from "@/lib/money";
import { botonAcento, insignia, lista } from "@/components/ui/estilos";
import { Aviso } from "@/components/ui/Aviso";

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
  const [imported, rowsResult, categories, accounts, notas, movimientos] = await Promise.all([
    supabase.from("finanzas_imports").select("*").eq("id", id).single(),
    supabase.from("finanzas_import_rows").select("*").eq("import_id", id).order("line_no"),
    getCategories(),
    getAccounts(),
    getNotas(),
    // Una vez confirmado, las filas de staging pasan a "accepted": lo que este
    // resumen dejo en las cuentas hay que contarlo en transactions.
    supabase
      .from("finanzas_transactions")
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

  const cuenta = accounts.find((a) => a.id === imported.data.account_id);
  // Lo que el resumen dijo de si mismo al subirlo. Los resumenes viejos no lo
  // tienen, y entonces no hay con que contradecir a la cuenta.
  const identity = (imported.data.raw_extraction as { identity?: StatementIdentity } | null)
    ?.identity;
  const conflicto =
    identity && cuenta ? accountConflict(identity, cuenta.name) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <span className="min-w-0 break-words">{imported.data.filename}</span>
            {imported.data.provisional ? (
              <span className={insignia}>provisorio</span>
            ) : null}
          </h1>
          {/* "Reconcilia" era un recuadro verde, y un import que no reconcilia
              ni llega hasta aca: siempre decia que si. Un cartel que nunca
              cambia es ruido con forma de noticia, asi que va como un dato mas
              de la ficha del resumen. */}
          <p className="mt-1 text-sm text-muted">
            {[
              identity ? statementLabel(identity) : null,
              imported.data.provisional
                ? `Periodo ${(imported.data.period_close ?? "").slice(0, 7)}`
                : `Cierre ${imported.data.period_close ?? "?"}`,
              `${rows.length} filas leidas`,
              `${pending.length} gastos`,
              yaImportado ? "ya importado" : `${porRevisar.length} por revisar`,
            ]
              .filter(Boolean)
              .join(" · ")}
            {" · "}
            <span className="text-positive">reconcilia al centavo</span>
          </p>
        </div>
        <Link
          href="/importar"
          className="-my-1.5 shrink-0 py-1.5 text-sm text-muted transition hover:text-foreground"
        >
          Volver
        </Link>
      </div>

      {error ? <Aviso tono="negativo">{error}</Aviso> : null}

      {imported.data.provisional ? (
        <Aviso tono="acento">
          Sale de la lista del home banking, de un resumen que todavía no cerró.
          Los movimientos quedan marcados como provisorios y el PDF real los
          reemplaza cuando lo subas.
        </Aviso>
      ) : null}

      {/* El unico bloque con caja de la pantalla, porque es lo unico accionable
          de la cabecera. La cuenta se deduce del resumen, asi que se muestra
          donde todavia se puede corregir: despues de confirmar forma parte de
          la huella de cada movimiento y ya no se cambia. */}
      <div
        className={`flex flex-wrap items-center gap-3 rounded-contenedor border px-3 py-2.5 text-sm ${
          conflicto ? "border-negative/40 bg-negative/10" : "border-border bg-surface"
        }`}
      >
        <span className="text-muted">Cuenta</span>
        {yaImportado ? (
          <strong>{cuenta?.name ?? "?"}</strong>
        ) : (
          <ImportAccountSelect
            importId={id}
            accounts={accounts.filter((a) => a.active || a.id === imported.data.account_id)}
            current={imported.data.account_id}
          />
        )}
        {conflicto ? (
          <span className="text-xs text-negative">
            {conflicto} Si no es la que corresponde, cambiala antes de confirmar.
          </span>
        ) : null}
      </div>

      {porRevisar.length > 0 ? (
        <section>
          <h2 className="mb-1 text-base font-semibold">Por revisar ({porRevisar.length})</h2>
          <p className="mb-3 text-sm text-muted">
            Lo que categorices acá se guarda como regla: el próximo resumen lo
            mapea solo.
          </p>
          <ImportRowList rows={porRevisar} categories={categories} notas={notas} importId={id} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-base font-semibold">
          {porRevisar.length > 0 ? "Ya mapeadas" : "Movimientos"} (
          {yaImportado ? movimientosCreados : pending.length - porRevisar.length})
        </h2>
        <ImportRowList
          rows={(yaImportado ? rows.filter((r) => r.status === "accepted") : pending).filter(
            (r) => !r.needs_review,
          )}
          categories={categories}
          notas={notas}
          importId={id}
          readOnly={yaImportado}
        />
      </section>

      {descartadas.length > 0 ? (
        <section>
          <h2 className="mb-1 text-base font-semibold text-muted">
            No se importan ({descartadas.length})
          </h2>
          <p className="mb-3 text-sm text-muted">
            El resumen las trae y hacen falta para que reconcilie, pero no son
            gastos: el pago mueve plata entre cuentas propias y ese consumo ya
            esta contado en las lineas de arriba.
          </p>
          {/* Banda como el resto de las listas: lo que dice que no entran son el
              titulo, la bajada y el gris, no una caja punteada alrededor. */}
          <ul className={lista}>
            {(descartadas as unknown as ImportRow[]).map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 px-3 py-2 text-sm text-muted"
              >
                <span className="tabular w-14 shrink-0 text-xs">
                  {row.occurred_on?.slice(5)}
                </span>
                <span className="min-w-0 flex-1 truncate">{row.raw_description}</span>
                <span className="shrink-0 text-xs">{KIND_LABELS[row.kind as Kind]}</span>
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
            <button type="submit" disabled={porRevisar.length > 0} className={botonAcento}>
              {imported.data.provisional
                ? `Cargar ${pending.length} movimientos provisorios`
                : `Confirmar e importar ${pending.length} movimientos`}
            </button>
          </form>
          {porRevisar.length > 0 ? (
            <span className="text-sm text-muted">Falta categorizar {porRevisar.length}.</span>
          ) : null}
          <div className="ml-auto">
            <DeleteImportButton importId={id} transactionCount={0} label="Descartar resumen" />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
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
