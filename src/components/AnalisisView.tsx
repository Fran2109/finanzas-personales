import Link from "next/link";

import { Amount } from "@/components/Amount";
import { BarList, type Bar } from "@/components/charts/BarList";
import { DivergingBars } from "@/components/charts/DivergingBars";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { ShareLegend, StackedShare } from "@/components/charts/StackedShare";
import type { CommittedShare, FuturePeriod, MonthFlow, Plan } from "@/lib/commitments";
import type { CategoryDelta } from "@/lib/analysis";
import { formatPeriod, shiftPeriod, type Currency } from "@/lib/domain";
import { formatCents, type Cents } from "@/lib/money";
import { insignia, lista, vacio } from "@/components/ui/estilos";

export type MesHistorico = {
  period: string;
  share: CommittedShare[];
  provisorios: number;
  total: number;
};

/**
 * La pantalla de analisis, con todo ya calculado.
 *
 * Separada de la pagina para poder mirarla renderizada sin base de datos: una
 * copia del markup en un banco de pruebas se desfasa del original y termina
 * verificando algo que no existe.
 */
export function AnalisisView({
  flujo,
  faltaPorCategoria,
  variacion,
  comparados,
  ultimoEsProvisorio,
  planes,
  calendario,
  historico,
  categorias,
  totalCategorias,
  faltaPorPagar,
  periodos,
}: {
  flujo: MonthFlow[];
  faltaPorCategoria: Bar[];
  variacion: CategoryDelta[];
  comparados: { anterior: string; ultimo: string } | null;
  ultimoEsProvisorio: boolean;
  planes: Plan[];
  calendario: FuturePeriod[];
  historico: MesHistorico[];
  categorias: Bar[];
  totalCategorias: Cents;
  faltaPorPagar: { currency: Currency; amount: Cents }[];
  periodos: string[];
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Análisis</h1>
        <p className="mt-1 text-sm text-muted">
          Cuánto de lo que viene ya está decidido.
        </p>
      </div>

      {planes.length === 0 ? (
        <p className={vacio}>
          No hay cuotas en curso. Cuando importes un resumen con compras en
          cuotas, acá vas a ver cuánto de cada mes ya está comprometido.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-1 text-base font-semibold">Lo que falta pagar</h2>
            {faltaPorPagar.map((t) => (
              <p key={t.currency} className="mb-2 text-base leading-snug">
                Te falta pagar{" "}
                <Amount
                  cents={t.amount}
                  currency={t.currency}
                  className="cifra align-baseline text-2xl"
                />
                .
              </p>
            ))}
            <p className="mb-5 text-sm leading-relaxed text-muted">
              De {planes.length} compra{planes.length === 1 ? "" : "s"} que
              todavía estás pagando. Incluye la cuota del resumen en curso: ya
              está cargada, pero se paga recién el mes que viene. Es el mismo
              total que suma el calendario de acá abajo.
            </p>

            {faltaPorCategoria.length > 1 ? (
              <>
                <p className="mb-3 text-sm leading-relaxed text-muted">
                  En qué se te va a ir esa plata. Lo que sea costo de
                  financiarse no compró nada: es lo que pagás <em>por</em> pagar
                  en cuotas.
                </p>
                <BarList bars={faltaPorCategoria} />
              </>
            ) : null}
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold">¿Te estás soltando o atando?</h2>
            <p className="mb-3 text-sm leading-relaxed text-muted">
              Cada mes entra compromiso (compras nuevas en cuotas) y sale
              (planes que pagaron su última). El saldo dice con cuánta cuota fija
              arranca el mes siguiente comparado con el anterior.
            </p>
            <div>
              <DivergingBars
                items={flujo.map((f) => ({
                  label: formatPeriod(f.period),
                  value: f.net,
                  hint:
                    f.takenCount === 0 && f.releasedCount === 0
                      ? "· sin cambios"
                      : `· ${f.takenCount} ${f.takenCount === 1 ? "nueva" : "nuevas"}, ${f.releasedCount} ${f.releasedCount === 1 ? "terminada" : "terminadas"}`,
                }))}
                izquierda="te soltaste"
                derecha="te ataste"
              />
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Un plan que empezó antes del primer resumen importado nunca
                aparece como tomado: no se lo vio arrancar. Por eso los primeros
                meses subestiman lo que entró.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold">El mes en curso y los que vienen</h2>
            <p className="mb-3 text-sm leading-relaxed text-muted">
              Cada mes arranca con esto ya gastado, antes de que compres nada. El
              mes en curso va en gris porque no es proyección: son las cuotas que
              ya tenés cargadas, el mismo número que “Mes” filtrando por Cuotas.
            </p>
            <div className="mb-4 overflow-x-auto">
              <ColumnChart
                columns={calendario.map((mes) => ({
                  label: mes.period.slice(5) + "/" + mes.period.slice(2, 4),
                  value: mes.totals.find((t) => t.currency === "ARS")?.total ?? 0,
                  // El mes en curso es contexto: ya paso, no se proyecta. El
                  // acento queda para lo que todavia se puede decidir.
                  muted: mes.recorded,
                  title: `${formatPeriod(mes.period)}${
                    mes.recorded ? " (en curso, ya cargado)" : ""
                  }: ${mes.totals
                    .map((t) => formatCents(t.total, t.currency))
                    .join(" + ")} en ${mes.plans.length} cuota${
                    mes.plans.length === 1 ? "" : "s"
                  }`,
                }))}
              />
            </div>

            <ul className={lista}>
              {calendario.map((mes) => (
                <li key={mes.period} className="px-3 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="min-w-0 text-sm font-medium capitalize">
                      {formatPeriod(mes.period)}
                      {mes.recorded ? (
                        <span className="ml-2 rounded bg-border px-1.5 py-0.5 text-[10px] font-normal normal-case text-muted">
                          en curso
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-baseline gap-3">
                      {mes.totals.map((t) => (
                        <Amount
                          key={t.currency}
                          cents={t.total}
                          currency={t.currency}
                          className="tabular text-sm font-medium"
                        />
                      ))}
                    </span>
                  </div>
                  {/* A dos lineas: con ocho cuotas en un mes esto era un muro
                      de diez lineas en un telefono, y lo que importa de la fila
                      es el numero. El detalle completo, con monto y hasta
                      cuando, esta en "Compras en curso" aca abajo. */}
                  <div className="mt-1 line-clamp-2 text-xs text-muted">
                    {mes.plans
                      .map((p) => `${p.description} (${p.cuota})`)
                      .join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold">Compras en curso</h2>
            <p className="mb-3 text-sm text-muted">
              Cuándo se libera cada una. Una que termina este mes sigue acá hasta
              que se pague el resumen.
            </p>
            <ul className={lista}>
              {planes.map((plan) => (
                // El detalle va en su propia linea y envuelve. Compartiendola
                // con el importe, en un telefono le quedaban ~180px y truncaba
                // en "cuota 6 de 12 · faltan pag...": se perdia cuando termina,
                // la categoria y la cuenta, que es todo lo que tenia para decir.
                <li key={plan.key} className="px-3 py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{plan.description}</span>
                    <span className="shrink-0 text-right">
                      <Amount
                        cents={plan.unpaidTotal}
                        currency={plan.currency}
                        className="block text-sm font-medium"
                      />
                      <span className="block text-xs text-muted">
                        {formatCents(plan.amount, plan.currency)} por mes
                      </span>
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {[
                      `cuota ${plan.cuotaCurrent} de ${plan.cuotaTotal}`,
                      `faltan pagar ${plan.unpaid}`,
                      `termina en ${formatPeriod(plan.endsOn)}`,
                      // Un plan que no aparecio en el ultimo resumen: o termino
                      // antes, o esa linea no se leyo. Decirlo es mejor que
                      // proyectarlo como si nada.
                      plan.behind
                        ? `no apareció en ${formatPeriod(shiftPeriod(plan.nextPeriod, -1))}`
                        : null,
                      plan.categoryName,
                      plan.accountName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section>
        <h2 className="mb-1 text-base font-semibold">Cuánto ya estaba decidido</h2>
        <p className="mb-3 text-sm leading-relaxed text-muted">
          De cada mes cerrado, qué parte eran cuotas de compras anteriores. Sobre
          esa parte no se podía hacer nada ese mes: ya estaba comprometida.
        </p>
        <div className="mb-3">
          <ShareLegend />
        </div>
        <ul className={lista}>
          {historico.map((mes) => (
            <li key={mes.period} className="px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/?mes=${mes.period}`}
                  className="-my-1.5 py-1.5 text-base font-medium capitalize hover:underline"
                >
                  {formatPeriod(mes.period)}
                </Link>
                {mes.provisorios > 0 ? (
                  <span className={insignia}>
                    {mes.provisorios} de {mes.total} provisorios
                  </span>
                ) : null}
              </div>
              <div className="mt-2 space-y-2.5">
                {mes.share.map((s) => (
                  <StackedShare
                    key={s.currency}
                    committed={s.committed}
                    discretionary={s.discretionary}
                    currency={s.currency}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
        {historico.some((m) => m.provisorios > 0) ? (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Un mes con movimientos provisorios todavía puede cambiar: el resumen
            no cerró. Compararlo contra meses cerrados como si fuera una
            tendencia es leer de más.
          </p>
        ) : null}
      </section>

      {variacion.length > 0 && comparados ? (
        <section>
          <h2 className="mb-1 text-base font-semibold">Qué cambió respecto del mes anterior</h2>
          <p className="mb-3 text-sm leading-relaxed text-muted">
            {formatPeriod(comparados.ultimo)} contra{" "}
            {formatPeriod(comparados.anterior)}, en pesos. Una categoría que
            aparece o desaparece cuenta como cambio: suele ser el más grande.
          </p>
          <div>
            <DivergingBars
              items={variacion.slice(0, 8).map((v) => ({
                label: v.label,
                value: v.delta,
                hint:
                  v.before === 0 ? "· nueva" : v.after === 0 ? "· no aparece" : undefined,
              }))}
              izquierda="gastaste menos"
              derecha="gastaste más"
            />
            {ultimoEsProvisorio ? (
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {formatPeriod(comparados.ultimo)} todavía tiene movimientos
                provisorios: el resumen no cerró, así que va a seguir subiendo.
                Leerlo como tendencia es leer de más.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {categorias.length > 0 ? (
        <section>
          <h2 className="mb-1 text-base font-semibold">En qué se va</h2>
          <p className="mb-3 text-sm leading-relaxed text-muted">
            Todo el historial, en pesos. Lo de arriba manda: apretarse con lo de
            abajo casi no mueve la aguja.
          </p>
          <div>
            <BarList bars={categorias} total={totalCategorias} />
          </div>
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-muted">
        Los montos en dólares van aparte y nunca pesificados: sin cotizaciones
        cargadas no hay conversión honesta que hacer.{" "}
        {periodos.length < 6 ? (
          <>
            Con {periodos.length} {periodos.length === 1 ? "mes" : "meses"} de
            historia todavía no hay con qué hablar de tendencias ni de
            estacionalidad.
          </>
        ) : null}
      </p>
    </div>
  );
}
