import { AccountForm } from "@/components/AccountForm";
import { AccountRow } from "@/components/AccountRow";
import { getAccountsWithActivity } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [accounts, imports] = await Promise.all([
    getAccountsWithActivity(),
    supabase.from("imports").select("account_id"),
  ]);

  // Los resumenes caen con la cuenta (FK en cascada): hay que avisar cuantos.
  const importsPorCuenta = new Map<string, number>();
  for (const row of imports.data ?? []) {
    importsPorCuenta.set(row.account_id, (importsPorCuenta.get(row.account_id) ?? 0) + 1);
  }

  const activas = accounts.filter((a) => a.active);
  const archivadas = accounts.filter((a) => !a.active);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-6">
        <div>
          <h1 className="mb-3 text-lg font-semibold">Cuentas</h1>

          {error ? (
            <p className="mb-3 rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </p>
          ) : null}

          {activas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              No tenes ninguna cuenta activa.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {activas.map((account) => (
                <AccountRow
                  // Remonta la fila cuando el guardado cambio algo, y asi el
                  // editor en linea vuelve solo al modo lectura.
                  key={`${account.id}-${account.name}-${account.type}-${account.currency}`}
                  account={account}
                  importCount={importsPorCuenta.get(account.id) ?? 0}
                />
              ))}
            </ul>
          )}
        </div>

        {archivadas.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">
              Archivadas ({archivadas.length})
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {archivadas.map((account) => (
                <AccountRow
                  key={`${account.id}-${account.name}-${account.type}-${account.currency}`}
                  account={account}
                  importCount={importsPorCuenta.get(account.id) ?? 0}
                />
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-xs leading-relaxed text-muted">
          La tarjeta se modela a nivel resumen, no por plastico: si dos tarjetas
          se pagan con un solo pago son una sola cuenta, y el numero de cada
          plastico va en el movimiento. Una cuenta con movimientos se archiva,
          no se borra: archivarla la saca del paso sin perder el historial.
          La app registra salidas, no lleva saldos, asi que las cuentas no
          muestran uno.
        </p>
      </section>

      <aside>
        <h2 className="mb-3 text-sm font-semibold">Nueva cuenta</h2>
        <AccountForm />
      </aside>
    </div>
  );
}
