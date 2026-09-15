import { AccountForm } from "@/components/AccountForm";
import { AccountRow } from "@/components/AccountRow";
import { getAccountsWithActivity } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { gridDosColumnas, lista, vacio } from "@/components/ui/estilos";
import { Aviso } from "@/components/ui/Aviso";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [accounts, imports] = await Promise.all([
    getAccountsWithActivity(),
    supabase.from("finanzas_imports").select("account_id"),
  ]);

  // Los resumenes caen con la cuenta (FK en cascada): hay que avisar cuantos.
  const importsPorCuenta = new Map<string, number>();
  for (const row of imports.data ?? []) {
    importsPorCuenta.set(row.account_id, (importsPorCuenta.get(row.account_id) ?? 0) + 1);
  }

  const activas = accounts.filter((a) => a.active);
  const archivadas = accounts.filter((a) => !a.active);

  // min-w-0 en las dos columnas: un item de grid no baja de su ancho de
  // contenido, asi que sin esto un nombre largo ensancha la columna entera y
  // desborda la pagina en un telefono.
  return (
    <div className={gridDosColumnas}>
      <section className="min-w-0 space-y-6">
        <div>
          <h1 className="mb-3 text-lg font-semibold">Cuentas</h1>

          {error ? (
            <Aviso tono="negativo" className="mb-3">
              {error}
            </Aviso>
          ) : null}

          {activas.length === 0 ? (
            <p className={vacio}>No tenes ninguna cuenta activa.</p>
          ) : (
            <ul className={lista}>
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
            <h2 className="mb-3 text-base font-semibold text-muted">
              Archivadas ({archivadas.length})
            </h2>
            <ul className={lista}>
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

        <p className="text-sm text-muted">
          La tarjeta se modela a nivel resumen, no por plastico: si dos tarjetas
          se pagan con un solo pago son una sola cuenta, y el numero de cada
          plastico va en el movimiento. Una cuenta con movimientos se archiva,
          no se borra: archivarla la saca del paso sin perder el historial.
          La app registra salidas, no lleva saldos, asi que las cuentas no
          muestran uno.
        </p>
      </section>

      <aside className="min-w-0">
        <h2 className="mb-3 text-base font-semibold">Nueva cuenta</h2>
        <AccountForm />
      </aside>
    </div>
  );
}
