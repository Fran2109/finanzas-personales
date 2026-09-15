import { MesView } from "@/components/MesView";
import {
  getAccounts,
  getCategories,
  getTransactionsForPeriod,
  summarize,
} from "@/lib/data";
import { isPeriod, periodOf } from "@/lib/domain";
import { applyFilters, readFilters } from "@/lib/filters";

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
    <MesView
      period={period}
      filters={filters}
      accounts={accounts}
      categories={categories}
      transactions={transactions}
      totalSinFiltrar={todosLosMovimientos.length}
      summary={summary}
      currencies={currencies}
      provisorios={provisorios}
      reemplazo={reemplazo}
      defaultDate={defaultDate}
    />
  );
}
