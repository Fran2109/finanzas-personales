import Link from "next/link";

import { Amount } from "@/components/Amount";
import { BarList, type Bar } from "@/components/charts/BarList";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { ShareLegend, StackedShare } from "@/components/charts/StackedShare";
import type { CommittedShare, FuturePeriod, Plan } from "@/lib/commitments";
import { formatPeriod, type Currency } from "@/lib/domain";
import { formatCents, type Cents } from "@/lib/money";

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
  planes,
  calendario,
  historico,
  categorias,
  totalCategorias,
  faltaPorPagar,
  periodos,
}: {
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
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          No hay cuotas en curso. Cuando importes un resumen con compras en
          cuotas, acá vas a ver cuánto de cada mes ya está comprometido.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-1 text-sm font-semibold">Lo que falta pagar</h2>
            <p className="mb-3 text-xs leading-relaxed text-muted">
              La suma de todas las cuotas que quedan de {planes.length} compra
              {planes.length === 1 ? "" : "s"} en curso. No es deuda de este mes:
              es plata que ya está comprometida y va a salir igual.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {faltaPorPagar.map((t) => (
                <div
                  key={t.currency}
                  className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2.5"
                >
                  <div className="text-xs text-muted">
                    Falta pagar {t.currency !== "ARS" ? t.currency : null}
                  </div>
                  <Amount
                    cents={t.amount}
                    currency={t.currency}
                    className="mt-0.5 block text-xl font-medium"
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold">Los meses que vienen</h2>
            <p className="mb-3 text-xs leading-relaxed text-muted">
              Cada mes arranca con esto ya gastado, antes de que compres nada.
              Cada cuota cae en el mes siguiente al último resumen que la trajo.
            </p>
            <div className="mb-3 overflow-x-auto rounded-lg border border-border bg-surface p-3">
              <ColumnChart
                columns={calendario.map((mes) => ({
                  label: mes.period.slice(5) + "/" + mes.period.slice(2, 4),
                  value: mes.totals.find((t) => t.currency === "ARS")?.total ?? 0,
                  title: `${formatPeriod(mes.period)}: ${mes.totals
                    .map((t) => formatCents(t.total, t.currency))
                    .join(" + ")} en ${mes.plans.length} cuota${
                    mes.plans.length === 1 ? "" : "s"
                  }`,
                }))}
              />
            </div>

            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {calendario.map((mes) => (
                <li key={mes.period} className="px-3 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium capitalize">
                      {formatPeriod(mes.period)}
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
            <h2 className="mb-1 text-sm font-semibold">Compras en curso</h2>
            <p className="mb-3 text-xs text-muted">
              Cuándo se libera cada una.
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {planes.map((plan) => (
                <li
                  key={plan.key}
                  className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{plan.description}</div>
                    <div className="truncate text-xs text-muted">
                      {[
                        `cuota ${plan.cuotaCurrent} de ${plan.cuotaTotal}`,
                        `quedan ${plan.remaining}`,
                        `termina en ${formatPeriod(plan.endsOn)}`,
                        plan.categoryName,
                        plan.accountName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <span className="shrink-0 text-right">
                    <Amount
                      cents={plan.remainingTotal}
                      currency={plan.currency}
                      className="block text-sm font-medium"
                    />
                    <span className="block text-xs text-muted">
                      {formatCents(plan.amount, plan.currency)} por mes
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section>
        <h2 className="mb-1 text-sm font-semibold">Cuánto ya estaba decidido</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          De cada mes cerrado, qué parte eran cuotas de compras anteriores. Sobre
          esa parte no se podía hacer nada ese mes: ya estaba comprometida.
        </p>
        <div className="mb-3">
          <ShareLegend />
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {historico.map((mes) => (
            <li key={mes.period} className="px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/?mes=${mes.period}`}
                  className="text-sm font-medium capitalize hover:underline"
                >
                  {formatPeriod(mes.period)}
                </Link>
                {mes.provisorios > 0 ? (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
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

      {categorias.length > 0 ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold">En qué se va</h2>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Todo el historial, en pesos. Lo de arriba manda: apretarse con lo de
            abajo casi no mueve la aguja.
          </p>
          <div className="rounded-lg border border-border bg-surface px-3 py-3">
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
