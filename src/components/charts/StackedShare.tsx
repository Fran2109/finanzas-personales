import { formatCents, type Cents } from "@/lib/money";

/**
 * Parte y todo, con dos clases: lo que ya estaba decidido y lo que no.
 *
 * Es la forma de **enfasis**, no una categorica: una sola clase lleva el tono
 * de acento porque es la que cuenta la historia, y la otra queda en el gris de
 * contexto. Dos tonos elegidos y validados contra la superficie en los dos
 * modos, no dos colores cualquiera.
 *
 * Los dos segmentos se separan con 2px del color de la superficie. La
 * separacion la hace el hueco, no un borde: un borde agrega tinta que no es
 * dato.
 */
export function StackedShare({
  committed,
  discretionary,
  currency,
}: {
  committed: Cents;
  discretionary: Cents;
  currency: string;
}) {
  const total = committed + discretionary;
  const pct = total === 0 ? 0 : Math.round((committed / total) * 100);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">
          {currency !== "ARS" ? `${currency} · ` : null}
          <strong className="text-foreground">{pct}%</strong> ya estaba decidido
        </span>
        <span className="tabular text-muted">
          {formatCents(committed, currency)} de {formatCents(total, currency)}
        </span>
      </div>

      {/* `data-anim` en el track y no en cada segmento: los dos son una parte
          sobre un todo, y lo que crece es el todo. Marcados por separado, cada
          uno arrancaria desde su propio borde y se leerian como dos barras. */}
      <div
        data-anim="bar"
        className="mt-1.5 flex h-3.5 w-full gap-0.5"
        role="img"
        aria-label={`${pct}% del mes ya estaba comprometido`}
      >
        {committed > 0 ? (
          <div
            className="h-full rounded-l bg-accent"
            style={{ width: `${total === 0 ? 0 : (committed / total) * 100}%` }}
            title={`Ya estaba decidido: ${formatCents(committed, currency)}`}
          />
        ) : null}
        {discretionary > 0 ? (
          <div
            className="h-full rounded-r bg-chart-track"
            style={{ width: `${total === 0 ? 0 : (discretionary / total) * 100}%` }}
            title={`Decidido este mes: ${formatCents(discretionary, currency)}`}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Dos series, asi que la leyenda va siempre: la identidad nunca es solo color. */
export function ShareLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-accent" />
        Ya estaba decidido (cuotas)
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-chart-track" />
        Decidido este mes
      </span>
    </div>
  );
}
