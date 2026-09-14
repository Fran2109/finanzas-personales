import Link from "next/link";

import { Amount } from "@/components/Amount";
import { getInstallmentRows, getMonthlyRows } from "@/lib/data";
import {
  commitmentCalendar,
  committedShare,
  openPlans,
  type CommittedShare,
} from "@/lib/commitments";
import { formatPeriod, type Currency } from "@/lib/domain";
import { formatCents, type Cents } from "@/lib/money";

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

  const faltaPorPagar = totalPorMoneda(
    planes.map((p) => ({ currency: p.currency, amount: p.remainingTotal })),
  );

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
                  <div className="mt-1 text-xs text-muted">
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
              <div className="mt-2 space-y-2">
                {mes.share.map((s) => (
                  <Barra key={s.currency} share={s} />
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

function Barra({ share }: { share: CommittedShare }) {
  const pct = share.share === null ? 0 : Math.round(share.share * 100);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">
          {share.currency !== "ARS" ? `${share.currency} · ` : null}
          <strong className="text-foreground">{pct}%</strong> ya estaba decidido
        </span>
        <span className="tabular text-muted">
          {formatCents(share.committed, share.currency)} de{" "}
          {formatCents(share.total, share.currency)}
        </span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`${pct}% comprometido`}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
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
