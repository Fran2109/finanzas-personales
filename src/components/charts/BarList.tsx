import { formatCents, type Cents } from "@/lib/money";

export type Bar = { label: string; value: Cents; hint?: string };

/**
 * Barras acostadas: comparar magnitudes con nombres largos.
 *
 * En HTML y no en SVG. Las barras son rectangulos y el texto es texto: con SVG
 * habria que resolver a mano el ajuste de cada etiqueta, y no compra nada.
 *
 * Todas del mismo tono a proposito. Pintar cada barra de un color distinto
 * gastaria el canal de identidad en repetir lo que el largo ya dice, y encima
 * sugeriria que las categorias son series distintas cuando son la misma cosa
 * partida en pedazos.
 */
export function BarList({
  bars,
  currency = "ARS",
  total,
}: {
  bars: Bar[];
  currency?: string;
  total?: Cents;
}) {
  if (bars.length === 0) return null;

  const maximo = Math.max(...bars.map((b) => b.value), 1);
  const suma = total ?? bars.reduce((t, b) => t + b.value, 0);

  return (
    <ul className="space-y-2.5">
      {bars.map((bar) => {
        const ancho = Math.max((bar.value / maximo) * 100, 0.5);
        const pct = suma === 0 ? 0 : Math.round((bar.value / suma) * 100);
        return (
          <li key={bar.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
              {/* min-w-0 no es decorativo: sin el, un item de flex no baja de su
                  ancho de contenido y `truncate` no trunca nada, empujando el
                  importe fuera de la pantalla en un telefono. */}
              <span className="min-w-0 truncate">
                {bar.label}
                {bar.hint ? <span className="ml-1 text-muted">{bar.hint}</span> : null}
              </span>
              {/* El valor va en tinta de texto, nunca del color de la barra. */}
              <span className="tabular shrink-0 text-muted">
                {formatCents(bar.value, currency)}
                <span className="ml-1.5 text-foreground">{pct}%</span>
              </span>
            </div>
            <div
              className="mt-1 h-3.5 w-full"
              title={`${bar.label}: ${formatCents(bar.value, currency)} (${pct}%)`}
            >
              {/* Cuadrada contra el cero y redondeada en la punta: el extremo
                  redondeado marca donde termina el dato. */}
              <div
                data-anim="bar"
                className="h-full rounded-r bg-accent"
                style={{ width: `${ancho}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
