import { ViewTransition } from "react";

import { MesView } from "@/components/MesView";
import { Orquesta } from "@/components/motion/Orquesta";
import {
  getAccounts,
  getCategories,
  getNotas,
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

  const [todosLosMovimientos, categories, accounts, notas] = await Promise.all([
    getTransactionsForPeriod(period),
    getCategories(),
    getAccounts(),
    getNotas(),
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

  // El crossfade entre meses lo hace el navegador y no cuesta un byte de JS: el
  // DOM viejo se destruye en la navegacion, asi que no hay nada que una libreria
  // de animacion pueda interpolar. Solo puede fadear lo nuevo *despues* de la
  // espera, y eso hace sentir mas lenta una navegacion que ya lo es.
  //
  // `update` y no `enter`/`exit`: la clase se aplica solo cuando cambia el
  // contenido de esta misma pantalla, que es la flecha del mes. Entrar desde
  // Analisis o salir hacia el no anima, y eso no es cosmetico — es lo que
  // mantiene los dos mecanismos en transiciones disjuntas. `<Orquesta pantalla="mes">` se
  // monta en esa navegacion y aplica su estado inicial en el mismo commit en
  // que el navegador saca la foto: el crossfade fadearia hacia contenido en
  // opacidad 0 que despues vuelve a subir. Doble fade.
  return (
    <ViewTransition update="mes" enter="none" exit="none" share="none">
      <Orquesta pantalla="mes">
        <MesView
          period={period}
          filters={filters}
          accounts={accounts}
          categories={categories}
          transactions={transactions}
          notas={notas}
          totalSinFiltrar={todosLosMovimientos.length}
          summary={summary}
          currencies={currencies}
          provisorios={provisorios}
          reemplazo={reemplazo}
          defaultDate={defaultDate}
        />
      </Orquesta>
    </ViewTransition>
  );
}
