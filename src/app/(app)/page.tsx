import Link from "next/link";

import { Amount } from "@/components/Amount";
import { MonthFilters } from "@/components/MonthFilters";
import { TransactionForm } from "@/components/TransactionForm";
import { TransactionRow } from "@/components/TransactionRow";
import {
  getAccounts,
  getCategories,
  getTransactionsForPeriod,
  summarize,
  type Account,
  type Category,
  type Transaction,
} from "@/lib/data";
import {
  formatPeriod,
  isPeriod,
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
  // chico y asi las opciones salen de lo que hay de verdad.
  const transactions = applyFilters(todosLosMovimientos, filters);
  const summary = summarize(transactions);

  // Lo provisorio cuenta en los totales —para eso se carga, para ver como viene
  // el mes— pero se dice cuanto es: un total que mezcla lo cerrado con lo que
  // todavia puede cambiar y no lo aclara es un numero que engania.
  const provisorios = transactions.filter((t) => t.is_projected).length;
  const reemplazo = Number(params.reemplazo ?? 0);

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
        // El texto de busqueda es lo unico del filtro que vive en el
        // componente (se tipea antes de navegar). Remontarlo cuando cambia en
        // la URL lo vuelve a sincronizar: sin esto, volver al inicio limpio
        // dejaba la URL sin `q` pero el texto todavia escrito en la caja.
        key={filters.q}
        period={period}
        filters={filters}
        accounts={accounts.filter((a) => a.active)}
        categories={categories}
        shown={transactions.length}
        total={todosLosMovimientos.length}
      />

      {reemplazo > 0 ? (
        <p className="rounded-md border border-positive/40 bg-positive/10 px-3 py-2 text-sm">
          Llegó el resumen cerrado: reemplazó {reemplazo} movimiento
          {reemplazo === 1 ? "" : "s"} provisorio{reemplazo === 1 ? "" : "s"} de
          este mes.
        </p>
      ) : null}

      {provisorios > 0 ? (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-muted">
          <strong className="text-accent">
            {provisorios} de {transactions.length} movimientos son provisorios
          </strong>
          : salen de la lista del home banking, de un resumen que todavía no
          cerró. Cuando subas el PDF se reemplazan por lo definitivo.
        </p>
      ) : null}

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
          <TransactionList
            transactions={transactions}
            period={period}
            accounts={accounts}
            categories={categories}
          />
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
      {/* "Total gastado" y no "Gastado": este numero es la suma de los otros
          dos, y con nombres parecidos se leia uno por otro. Los dos de la
          derecha se llaman igual que los dos tipos de la app. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total gastado" cents={totals.total} currency={currency} destacado />
        <Stat label="Gastos" cents={totals.purchases} currency={currency} hint="sin cuotas" />
        <Stat label="Cuotas" cents={totals.installments} currency={currency} hint="de compras anteriores" />
      </div>
    </section>
  );
}

function Stat({
  label,
  cents,
  currency,
  destacado = false,
  hint,
}: {
  label: string;
  cents: Cents;
  currency: Currency;
  destacado?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        destacado ? "border-accent/40 bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <div className="text-xs text-muted">
        {label}
        {hint ? <span className="ml-1 opacity-70">({hint})</span> : null}
      </div>
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
              href={`/?${monthQuery(period, { ...filters, categoria: [category.id] })}`}
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
  accounts,
  categories,
}: {
  transactions: Transaction[];
  period: string;
  accounts: Account[];
  categories: Category[];
}) {
  if (transactions.length === 0) return null;

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold">
        Movimientos de {formatPeriod(period)}{" "}
        <span className="font-normal text-muted">({transactions.length})</span>
      </h2>
      <p className="mb-3 text-xs text-muted">
        Tocá cualquiera para corregirlo.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {transactions.map((tx) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            accounts={accounts}
            categories={categories}
          />
        ))}
      </ul>
    </section>
  );
}

