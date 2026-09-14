import { Amount } from "@/components/Amount";
import { AccountForm } from "@/components/AccountForm";
import { setAccountActive } from "@/app/actions";
import { getAccountBalances } from "@/lib/data";

const TYPE_LABELS: Record<string, string> = {
  bank: "Banco",
  cash: "Efectivo",
  credit_card: "Tarjeta de credito",
  investment: "Inversion",
};

export default async function AccountsPage() {
  const accounts = await getAccountBalances();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <section>
        <h1 className="mb-3 text-lg font-semibold">Cuentas</h1>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center gap-3 px-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className={account.active ? "" : "text-muted line-through"}>
                  {account.name}
                </div>
                <div className="text-xs text-muted">
                  {[
                    TYPE_LABELS[account.type] ?? account.type,
                    account.currency,
                    `${account.movements} movimientos`,
                  ].join(" · ")}
                </div>
              </div>
              <Amount cents={account.balance} currency={account.currency} tone="auto" />
              <form action={setAccountActive}>
                <input type="hidden" name="id" value={account.id} />
                <input type="hidden" name="active" value={String(!account.active)} />
                <button
                  type="submit"
                  className="text-xs text-muted transition hover:text-foreground"
                >
                  {account.active ? "Archivar" : "Reactivar"}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          La tarjeta se modela a nivel resumen, no por plastico: si dos tarjetas se
          pagan con un solo pago son una sola cuenta, y el numero de cada plastico
          va en el movimiento.
        </p>
      </section>

      <aside>
        <h2 className="mb-3 text-sm font-semibold">Nueva cuenta</h2>
        <AccountForm />
      </aside>
    </div>
  );
}
