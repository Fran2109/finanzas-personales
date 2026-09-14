import Link from "next/link";

import { Amount } from "@/components/Amount";
import { TransactionForm } from "@/components/TransactionForm";
import { deleteTransaction } from "@/app/actions";
import {
  getAccountBalances,
  getCategories,
  getTransactionsForPeriod,
  summarize,
  type Transaction,
} from "@/lib/data";
import {
  formatPeriod,
  isPeriod,
  KIND_LABELS,
  periodOf,
  shiftPeriod,
  type Currency,
  type Kind,
} from "@/lib/domain";
import { formatCents, type Cents } from "@/lib/money";

export default async function MonthPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const today = new Date();
  const period = mes && isPeriod(mes) ? mes : periodOf(today);

  const [transactions, categories, accounts] = await Promise.all([
    getTransactionsForPeriod(period),
    getCategories(),
    getAccountBalances(),
  ]);

  const summary = summarize(transactions);
  const currencies = [...summary.totals.keys()].sort();

  // El form arranca en hoy si estamos mirando el mes corriente; si no, en el
  // dia 1 del mes que se esta mirando, que es lo que uno quiere al cargar atras.
  const defaultDate =
    period === periodOf(today)
      ? today.toISOString().slice(0, 10)
      : `${period}-01`;

  return (
    <div className="space-y-8">
      <MonthNav period={period} />

      {currencies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          No hay movimientos en {formatPeriod(period)}. Carga el primero abajo.
        </p>
      ) : (
        <div className="space-y-6">
          {currencies.map((currency) => (
            <MonthTotals
              key={currency}
              currency={currency}
              totals={summary.totals.get(currency)!}
            />
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          <CategoryBreakdown byCategory={summary.byCategory} />
          <TransactionList transactions={transactions} period={period} />
        </div>

        <aside className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold">Nuevo movimiento</h2>
            <TransactionForm
              accounts={accounts.filter((a) => a.active)}
              categories={categories}
              defaultDate={defaultDate}
            />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">Saldo por cuenta</h2>
            <ul className="space-y-2">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className={account.active ? "" : "text-muted line-through"}>
                    {account.name}
                  </span>
                  <Amount
                    cents={account.balance}
                    currency={account.currency}
                    tone="auto"
                  />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Saldo de todo el historial, no del mes. En una tarjeta, negativo es
              deuda.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MonthNav({ period }: { period: string }) {
  return (
    <div className="flex items-center justify-between">
      <Link
        href={`/?mes=${shiftPeriod(period, -1)}`}
        className="rounded-md border border-border px-2.5 py-1.5 text-sm text-muted transition hover:text-foreground"
      >
        &larr;
      </Link>
      <h1 className="text-lg font-semibold capitalize">{formatPeriod(period)}</h1>
      <Link
        href={`/?mes=${shiftPeriod(period, 1)}`}
        className="rounded-md border border-border px-2.5 py-1.5 text-sm text-muted transition hover:text-foreground"
      >
        &rarr;
      </Link>
    </div>
  );
}

function MonthTotals({
  currency,
  totals,
}: {
  currency: Currency;
  totals: {
    spent: Cents;
    income: Cents;
    taxFee: Cents;
    financing: Cents;
    payments: Cents;
    installments: Cents;
  };
}) {
  const balance = totals.income - totals.spent - totals.taxFee - totals.financing;

  return (
    <section>
      {currency !== "ARS" ? (
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          {currency}
        </h2>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Consumo" cents={totals.spent} currency={currency} tone="negative" />
        <Stat label="Ingresos" cents={totals.income} currency={currency} tone="positive" />
        <Stat
          label="Impuestos y financiacion"
          cents={totals.taxFee + totals.financing}
          currency={currency}
        />
        <Stat label="Balance" cents={balance} currency={currency} tone="auto" />
      </div>
      {totals.installments !== 0 ? (
        <p className="mt-2 text-xs text-muted">
          De ese consumo, {formatCents(totals.installments, currency)} son cuotas
          de compras anteriores.
        </p>
      ) : null}
      {totals.payments !== 0 ? (
        <p className="mt-2 text-xs text-muted">
          Ademas pagaste {formatCents(totals.payments, currency)} de tarjeta. No
          entra en el consumo: ese gasto ya se conto cuando se hizo la compra.
        </p>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  cents,
  currency,
  tone = "plain",
}: {
  label: string;
  cents: Cents;
  currency: Currency;
  tone?: "auto" | "plain" | "negative" | "positive";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <Amount
        cents={cents}
        currency={currency}
        tone={cents === 0 ? "plain" : tone}
        className="mt-0.5 block text-base font-medium"
      />
    </div>
  );
}

function CategoryBreakdown({
  byCategory,
}: {
  byCategory: { id: string; name: string; currency: Currency; total: Cents }[];
}) {
  if (byCategory.length === 0) return null;

  const max = Math.max(...byCategory.map((c) => Math.abs(c.total)));

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">En que se fue</h2>
      <ul className="space-y-2">
        {byCategory.map((category) => (
          <li key={`${category.id}-${category.currency}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{category.name}</span>
              <Amount cents={category.total} currency={category.currency} />
            </div>
            <div className="mt-1 h-1 rounded-full bg-border">
              <div
                className="h-1 rounded-full bg-accent"
                style={{ width: `${(Math.abs(category.total) / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Entra todo: consumo, cuotas, impuestos, costos financieros y pagos. Ojo
        con los pagos de tarjeta, que son una transferencia y no un gasto nuevo:
        ese consumo ya esta contado en las categorias de arriba, asi que el
        total de esta lista no es lo que gastaste.
      </p>
    </section>
  );
}

function TransactionList({
  transactions,
  period,
}: {
  transactions: Transaction[];
  period: string;
}) {
  if (transactions.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">
        Movimientos de {formatPeriod(period)}{" "}
        <span className="font-normal text-muted">({transactions.length})</span>
      </h2>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {transactions.map((tx) => (
          <li key={tx.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="tabular w-12 shrink-0 text-xs text-muted">
              {tx.occurred_on.slice(8)}/{tx.occurred_on.slice(5, 7)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate">
                {tx.description || KIND_LABELS[tx.kind]}
                {tx.is_projected ? (
                  <span className="ml-2 rounded bg-border px-1.5 py-0.5 text-xs text-muted">
                    proyectado
                  </span>
                ) : null}
              </div>
              <div className="truncate text-xs text-muted">
                {[
                  tx.category?.name,
                  tx.account?.name,
                  tx.card_last4 ? `*${tx.card_last4}` : null,
                  tx.kind === "consumption" ? null : KIND_LABELS[tx.kind],
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <Amount
              cents={tx.amount}
              currency={tx.currency}
              tone={signTone(tx.kind)}
              className="shrink-0"
            />
            <form action={deleteTransaction}>
              <input type="hidden" name="id" value={tx.id} />
              <button
                type="submit"
                aria-label="Borrar movimiento"
                className="text-muted transition hover:text-negative"
              >
                &times;
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

function signTone(kind: Kind): "negative" | "positive" | "plain" {
  if (kind === "income" || kind === "refund") return "positive";
  if (kind === "payment" || kind === "transfer") return "plain";
  return "negative";
}
