import Link from "next/link";

import { Amount } from "@/components/Amount";
import { MonthFilters } from "@/components/MonthFilters";
import { TransactionForm } from "@/components/TransactionForm";
import { TransactionRow } from "@/components/TransactionRow";
import type { Account, Category, Transaction } from "@/lib/data";
import { formatPeriod, shiftPeriod, type Currency } from "@/lib/domain";
import { hasActiveFilters, monthQuery, type Filters } from "@/lib/filters";
import { type Cents } from "@/lib/money";
import { gridDosColumnas, lista, vacio } from "@/components/ui/estilos";
import { Aviso } from "@/components/ui/Aviso";

export type MonthSummary = {
  totals: Map<Currency, { total: Cents; purchases: Cents; installments: Cents }>;
  byCategory: { id: string; name: string; currency: Currency; total: Cents }[];
};

/**
 * La vista del mes, con todo ya calculado.
 *
 * Separada de la pagina por lo mismo que `AnalisisView`: para poder mirarla
 * renderizada sin base de datos. Una copia del markup en un banco de pruebas se
 * desfasa del original y termina verificando algo que no existe.
 */
export function MesView({
  period,
  filters,
  accounts,
  categories,
  transactions,
  totalSinFiltrar,
  summary,
  currencies,
  provisorios,
  reemplazo,
  defaultDate,
}: {
  period: string;
  filters: Filters;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  totalSinFiltrar: number;
  summary: MonthSummary;
  currencies: Currency[];
  provisorios: number;
  reemplazo: number;
  defaultDate: string;
}) {
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
        total={totalSinFiltrar}
      />

      {reemplazo > 0 ? (
        <Aviso tono="positivo" sobrio>
          Llegó el resumen cerrado: reemplazó {reemplazo} movimiento
          {reemplazo === 1 ? "" : "s"} provisorio{reemplazo === 1 ? "" : "s"} de
          este mes.
        </Aviso>
      ) : null}

      {provisorios > 0 ? (
        <Aviso tono="acento">
          <strong className="text-accent">
            {provisorios} de {transactions.length} movimientos son provisorios
          </strong>
          : salen de la lista del home banking, de un resumen que todavía no
          cerró. Cuando subas el PDF se reemplazan por lo definitivo.
        </Aviso>
      ) : null}

      {currencies.length === 0 ? (
        <p className={vacio}>
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

      {/* min-w-0 en las dos columnas: un item de grid no baja de su ancho de
          contenido, asi que sin esto una descripcion larga ensancha la columna
          entera y se lleva puesta la pagina en un telefono. */}
      <div className={gridDosColumnas}>
        <div className="min-w-0 space-y-8">
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

        <aside className="min-w-0">
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
          dos, y con nombres parecidos se leia uno por otro.
          Los otros dos no se llaman por su tipo sino por lo que significan:
          sobre las cuotas de compras viejas no se podia hacer nada este mes, y
          esa es la unica lectura que sirve para decidir algo. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total gastado" cents={totals.total} currency={currency} destacado />
        <Stat
          label="Ya estaba decidido"
          cents={totals.installments}
          currency={currency}
          hint={
            totals.total === 0
              ? "cuotas"
              : `${Math.round((totals.installments / totals.total) * 100)}%, cuotas`
          }
        />
        <Stat
          label="Decidido este mes"
          cents={totals.purchases}
          currency={currency}
          hint="gastos nuevos"
        />
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
        className={`mt-0.5 block ${
          destacado ? "cifra text-2xl" : "font-medium text-base"
        }`}
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
              // py-1 para que la fila se pueda tocar con el dedo: sin el
              // media 20px de alto, que es la mitad de un target comodo.
              className="flex items-baseline justify-between gap-3 py-1 text-sm hover:text-accent"
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
      <ul className={lista}>
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

