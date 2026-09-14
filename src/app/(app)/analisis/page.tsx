import { AnalisisView } from "@/components/AnalisisView";
import { getInstallmentRows, getMonthlyRows } from "@/lib/data";
import { commitmentCalendar, committedShare, openPlans } from "@/lib/commitments";
import type { Currency } from "@/lib/domain";
import type { Cents } from "@/lib/money";

const MESES_A_PROYECTAR = 12;

export default async function AnalisisPage() {
  const [cuotas, mensuales] = await Promise.all([getInstallmentRows(), getMonthlyRows()]);

  const planes = openPlans(cuotas);
  const calendario = commitmentCalendar(planes, MESES_A_PROYECTAR);

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

  const faltaPorPagar = totalPorMoneda(
    planes.map((p) => ({ currency: p.currency, amount: p.remainingTotal })),
  );

  return (
    <AnalisisView
      planes={planes}
      calendario={calendario}
      historico={historico}
      categorias={categorias}
      totalCategorias={totalCategorias}
      faltaPorPagar={faltaPorPagar}
      periodos={periodos}
    />
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
