import { AnalisisView } from "@/components/AnalisisView";
import { Orquesta } from "@/components/motion/Orquesta";
import { getInstallmentRows, getMonthlyRows } from "@/lib/data";
import {
  commitmentCalendar,
  committedShare,
  installmentFlow,
  openPlans,
  remainingByCategory,
  withCurrentMonth,
} from "@/lib/commitments";
import { categoryDeltas, periodsOf } from "@/lib/analysis";
import { periodOf, type Currency } from "@/lib/domain";
import type { Cents } from "@/lib/money";

const MESES_A_PROYECTAR = 12;

export default async function AnalisisPage() {
  const [cuotas, mensuales] = await Promise.all([getInstallmentRows(), getMonthlyRows()]);

  // Hasta que mes hay movimientos cargados de cada cuenta. Es lo que separa lo
  // que ya paso de lo que viene: sin esto un plan cuya ultima cuota quedo en
  // agosto proyecta la siguiente a septiembre aunque septiembre ya este cargado,
  // y el mismo mes queda contado dos veces con dos numeros distintos.
  const horizonte = new Map<string, string>();
  for (const row of mensuales) {
    const previo = horizonte.get(row.accountId);
    if (!previo || row.period > previo) horizonte.set(row.accountId, row.period);
  }

  // El resumen de este mes se paga a principios del que viene, asi que su cuota
  // esta registrada pero todavia no salio: para "falta pagar" cuenta como deuda.
  const mesEnCurso = periodOf(new Date());

  const planes = openPlans(cuotas, horizonte, mesEnCurso);
  // El mes en curso va adelante con lo que ya esta cargado, no proyectado: es
  // el mes que se esta viviendo y dejarlo afuera obligaba a cambiar de pantalla
  // para saber con que se arranco.
  const calendario = withCurrentMonth(
    commitmentCalendar(planes, MESES_A_PROYECTAR),
    cuotas,
    mesEnCurso,
  );

  // Historico por mes, con la parte que ya estaba decidida antes de empezar.
  const periodos = [...new Set(mensuales.map((r) => r.period))].sort().reverse();
  const historico = periodos.map((period) => {
    const delMes = mensuales.filter((r) => r.period === period);
    return {
      period,
      share: committedShare(
        delMes.map((r) => ({ amount: r.amount, currency: r.currency, kind: r.kind })),
      ),
      // Un mes con provisorios todavia puede cambiar: compararlo contra meses
      // cerrados sin decirlo hace leer como tendencia lo que es data a medias.
      provisorios: delMes.filter((r) => r.isProjected).length,
      total: delMes.length,
    };
  });

  // Concentracion por categoria, solo en pesos: sin cotizaciones cargadas
  // mezclar monedas en un ranking seria inventar una conversion.
  const porCategoria = new Map<string, Cents>();
  for (const row of mensuales) {
    if (row.currency !== "ARS") continue;
    porCategoria.set(row.categoryName, (porCategoria.get(row.categoryName) ?? 0) + row.amount);
  }
  const rankeadas = [...porCategoria]
    .map(([label, value]) => ({ label, value }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const totalCategorias = rankeadas.reduce((t, c) => t + c.value, 0);
  // Mas de siete clases dejan de leerse; la cola se junta en una.
  const TOPE = 7;
  const categorias =
    rankeadas.length > TOPE + 1
      ? [
          ...rankeadas.slice(0, TOPE),
          {
            label: "Otras",
            value: rankeadas.slice(TOPE).reduce((t, c) => t + c.value, 0),
            hint: `· ${rankeadas.length - TOPE} categorias`,
          },
        ]
      : rankeadas;

  // Sobre `unpaidTotal` y no sobre `remainingTotal`: lo que falta pagar incluye
  // la cuota del resumen en curso, que ya esta cargada y todavia no se pago. Es
  // el mismo total que suma el calendario, mes en curso incluido.
  const faltaPorPagar = totalPorMoneda(
    planes.map((p) => ({ currency: p.currency, amount: p.unpaidTotal })),
  );

  // Cuanto compromiso entro y salio cada mes: el calendario dice cuanto falta,
  // esto dice si la cosa va para arriba o para abajo.
  const flujo = installmentFlow(cuotas).filter((f) => f.currency === "ARS");

  // De lo que falta pagar, cuanto es cada categoria. Separa las cosas del costo
  // de financiarse, que es una deuda de otra naturaleza.
  const faltaPorCategoria = remainingByCategory(planes);

  // Que cambio entre los dos ultimos meses con movimientos.
  const [ultimo, anterior] = periodsOf(mensuales);
  const variacion =
    ultimo && anterior ? categoryDeltas(mensuales, anterior, ultimo) : [];
  const comparados = ultimo && anterior ? { anterior, ultimo } : null;
  const ultimoEsProvisorio = mensuales.some((r) => r.period === ultimo && r.isProjected);

  return (
    <Orquesta pantalla="analisis">
      <AnalisisView
        flujo={flujo}
        faltaPorCategoria={faltaPorCategoria}
        variacion={variacion}
        comparados={comparados}
        ultimoEsProvisorio={ultimoEsProvisorio}
        planes={planes}
        calendario={calendario}
        historico={historico}
        categorias={categorias}
        totalCategorias={totalCategorias}
        faltaPorPagar={faltaPorPagar}
        periodos={periodos}
      />
    </Orquesta>
  );
}

function totalPorMoneda(
  items: { currency: Currency; amount: Cents }[],
): { currency: Currency; amount: Cents }[] {
  const porMoneda = new Map<Currency, Cents>();
  for (const i of items) porMoneda.set(i.currency, (porMoneda.get(i.currency) ?? 0) + i.amount);
  return [...porMoneda]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
