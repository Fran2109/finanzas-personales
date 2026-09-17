import Link from "next/link";

import { Amount } from "@/components/Amount";
import { Contador } from "@/components/motion/Contador";
import { MonthFilters } from "@/components/MonthFilters";
import { TransactionForm } from "@/components/TransactionForm";
import { StackedShare } from "@/components/charts/StackedShare";
import { TransactionRow } from "@/components/TransactionRow";
import type { Account, Category, NotasPorCategoria, Transaction } from "@/lib/data";
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
  notas,
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
  notas: NotasPorCategoria;
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
        <Totales currencies={currencies} summary={summary} />
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
            accounts={accounts}
            categories={categories}
            notas={notas}
          />
        </div>

        <aside className="min-w-0">
          <section data-anim="seccion">
            <h2 className="mb-3 text-base font-semibold">Nuevo movimiento</h2>
            <TransactionForm
              accounts={accounts.filter((a) => a.active)}
              categories={categories}
              notas={notas}
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

/** El nombre de la moneda para leerla adentro de una oracion. */
const MONEDAS: Record<string, string> = { ARS: "pesos", USD: "dolares" };

/**
 * Cuanto se fue, y cuanto de eso ya estaba decidido antes de empezar.
 *
 * Eran seis cajas iguales —tres por moneda— y decian algo que no era cierto:
 * que los tres numeros eran pares. El primero es la suma de los otros dos, y
 * verlos con el mismo peso obligaba a reconstruir esa relacion cada vez.
 *
 * Ahora el numero entra en una oracion, en la display: el tipo hace el trabajo
 * que hacia el recuadro. Y la proporcion la dice la barra, que es la forma que
 * corresponde a una parte sobre un todo y ademas es la tesis de la app —las
 * cuotas son entre el 45% y el 52% de cada mes—.
 *
 * La segunda moneda no repite el tratamiento: es una linea. Dos heroes no son
 * una jerarquia.
 */
function Totales({
  currencies,
  summary,
}: {
  currencies: Currency[];
  summary: MonthSummary;
}) {
  const [principal, ...resto] = currencies;
  const t = summary.totals.get(principal)!;

  return (
    <section data-anim="hero" className="space-y-5">
      <p className="text-base leading-snug">
        Gastaste{" "}
        <Contador
          cents={t.total}
          currency={principal}
          className="cifra align-baseline text-2xl"
        />
        .
      </p>

      {t.total > 0 ? (
        <StackedShare
          committed={t.installments}
          discretionary={t.purchases}
          currency={principal}
        />
      ) : null}

      {resto.map((currency) => {
        const otra = summary.totals.get(currency)!;
        return (
          <p key={currency} className="text-sm text-muted">
            Y <Amount cents={otra.total} currency={currency} className="text-foreground" />{" "}
            en {MONEDAS[currency] ?? currency}
            {otra.installments > 0
              ? `, de los que ${Math.round((otra.installments / otra.total) * 100)}% son cuotas`
              : null}
            .
          </p>
        );
      })}
    </section>
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
    <section data-anim="seccion">
      <h2 className="mb-3 text-base font-semibold">En que se fue</h2>
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
  accounts,
  categories,
  notas,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  notas: NotasPorCategoria;
}) {
  if (transactions.length === 0) return null;

  return (
    <section data-anim="seccion">
      <h2 className="mb-1 text-base font-semibold">
        Movimientos{" "}
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
            notas={notas}
          />
        ))}
      </ul>
    </section>
  );
}

