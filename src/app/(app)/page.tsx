import Link from "next/link";

import { Amount } from "@/components/Amount";
import { MonthFilters } from "@/components/MonthFilters";
import { TransactionForm } from "@/components/TransactionForm";
import { deleteTransaction } from "@/app/actions";
import {
  getAccounts,
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
} from "@/lib/domain";
import {
  applyFilters,
  hasActiveFilters,
  monthQuery,
  readFilters,
  type Filters,
} from "@/lib/filters";
import { type Cents } from "@/lib/money";

export default async function MonthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const today = new Date();
  const period = params.mes && isPeriod(params.mes) ? params.mes : periodOf(today);
  const filters = readFilters(params);

  const [todosLosMovimientos, categories, accounts] = await Promise.all([
    getTransactionsForPeriod(period),
    getCategories(),
    getAccounts(),
  ]);

  // Los filtros se aplican sobre el mes ya traido: el volumen de un mes es
  // chico y asi las opciones de plastico salen de lo que hay de verdad.
  const transactions = applyFilters(todosLosMovimientos, filters);
  const summary = summarize(transactions);

  const cards = [
    ...new Set(todosLosMovimientos.map((t) => t.card_last4).filter((c): c is string => !!c)),
  ].sort();
  const currencies = [...summary.totals.keys()].sort();

  // El form arranca en hoy si estamos mirando el mes corriente; si no, en el
  // dia 1 del mes que se esta mirando, que es lo que uno quiere al cargar atras.
  const defaultDate =
    period === periodOf(today)
      ? today.toISOString().slice(0, 10)
      : `${period}-01`;

  return (
    <div className="space-y-8">
      <MonthNav period={period} filters={filters} />

      <MonthFilters
        period={period}
        filters={filters}
        accounts={accounts.filter((a) => a.active)}
        categories={categories}
        cards={cards}
        shown={transactions.length}
        total={todosLosMovimientos.length}
      />

      {currencies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          {hasActiveFilters(filters)
            ? "Ningun movimiento coincide con esos filtros."
            : `No hay movimientos en ${formatPeriod(period)}. Carga el primero abajo.`}
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
          <CategoryBreakdown
            byCategory={summary.byCategory}
            period={period}
            filters={filters}
          />
          <TransactionList transactions={transactions} period={period} />
        </div>

        <aside>
          <section>
            <h2 className="mb-3 text-sm font-semibold">Nuevo movimiento</h2>
            <TransactionForm
              accounts={accounts.filter((a) => a.active)}
              categories={categories}
              defaultDate={defaultDate}
            />
          </section>

        </aside>
      </div>
    </div>
  );
}

function MonthNav({ period, filters }: { period: string; filters: Filters }) {
  return (
    <div className="flex items-center justify-between">
      <Link
        href={`/?${monthQuery(shiftPeriod(period, -1), filters)}`}
        className="rounded-md border border-border px-2.5 py-1.5 text-sm text-muted transition hover:text-foreground"
      >
        &larr;
      </Link>
      <h1 className="text-lg font-semibold capitalize">{formatPeriod(period)}</h1>
      <Link
        href={`/?${monthQuery(shiftPeriod(period, 1), filters)}`}
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
  totals: { total: Cents; purchases: Cents; installments: Cents };
}) {
  return (
    <section>
      {currency !== "ARS" ? (
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          {currency}
        </h2>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Gastado" cents={totals.total} currency={currency} destacado />
        <Stat label="Gastos" cents={totals.purchases} currency={currency} />
        <Stat label="Cuotas" cents={totals.installments} currency={currency} />
      </div>
      {totals.installments !== 0 ? (
        <p className="mt-2 text-xs text-muted">
          Las cuotas son de compras anteriores: ya estaban decididas antes de
          este mes.
        </p>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  cents,
  currency,
  destacado = false,
}: {
  label: string;
  cents: Cents;
  currency: Currency;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        destacado ? "border-accent/40 bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <div className="text-xs text-muted">{label}</div>
      {/* Todo lo que la app registra es plata que salio, asi que no hay signos
          que interpretar: el numero es cuanto se fue. */}
      <Amount
        cents={cents}
        currency={currency}
        className={`mt-0.5 block font-medium ${destacado ? "text-xl" : "text-base"}`}
      />
    </div>
  );
}

function CategoryBreakdown({
  byCategory,
  period,
  filters,
}: {
  byCategory: { id: string; name: string; currency: Currency; total: Cents }[];
  period: string;
  filters: Filters;
}) {
  if (byCategory.length === 0) return null;

  const max = Math.max(...byCategory.map((c) => Math.abs(c.total)));

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">En que se fue</h2>
      <ul className="space-y-2">
        {byCategory.map((category) => (
          <li key={`${category.id}-${category.currency}`}>
            {/* Clickear una categoria filtra por ella: es la pregunta que
                sigue naturalmente a ver la barra mas larga. */}
            <Link
              href={`/?${monthQuery(period, { ...filters, categoria: category.id })}`}
              className="flex items-baseline justify-between gap-3 text-sm hover:text-accent"
            >
              <span>{category.name}</span>
              <Amount cents={category.total} currency={category.currency} />
            </Link>
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
        Entra toda la plata que sale: consumo, cuotas, impuestos y costos
        financieros. Los pagos de tarjeta no, porque mueven plata entre cuentas
        propias y ese gasto ya se conto cuando se compro.
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
                  // Explica por que una compra de junio aparece en agosto.
                  tx.statement_period && tx.statement_period !== tx.occurred_on.slice(0, 7)
                    ? `resumen ${tx.statement_period}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <Amount cents={tx.amount} currency={tx.currency} className="shrink-0" />
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

