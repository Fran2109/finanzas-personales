import { axisMax, columnPath, niceTicks } from "@/components/charts/scale";
import { formatCents, formatCompact, type Cents } from "@/lib/money";

export type Column = {
  label: string;
  value: Cents;
  title: string;
  /**
   * La columna es contexto, no el dato que cuenta la historia.
   *
   * El gris es `--chart-track`, que esta validado contra las dos superficies;
   * `--muted` es color de texto y contra el fondo daba 1,68:1.
   */
  muted?: boolean;
};

const ALTO = 150;
const ARRIBA = 14;
const ABAJO = 20;
const EJE = 46;
// Aire entre el eje y la primera columna: sin esto la etiqueta de valor de la
// primera queda pegada a la marca del eje y las dos se leen como una sola.
const PAD = 12;
const ANCHO_BARRA = 24;
const GAP = 2;

/**
 * Columnas: una magnitud a lo largo del tiempo.
 *
 * Una sola serie, asi que no lleva leyenda —el titulo dice que se esta
 * mirando— y un solo tono. Cada columna lleva su total arriba: leerlos del eje
 * es aproximar, y lo que se quiere saber de un mes es cuanto es, no mas o menos
 * donde cae.
 *
 * Lo que los hace caber es el formato compacto y que **el simbolo de moneda va
 * solo en la primera**. Repetirlo en cada columna no agrega nada —la moneda es
 * la misma en todas— y son los dos caracteres que hacen que dos etiquetas
 * vecinas se toquen.
 *
 * Una columna puede ir `muted` cuando no es de la misma naturaleza que el resto
 * —lo que ya paso al lado de lo que se proyecta—. Es la misma forma que usa
 * `StackedShare`: el acento lleva lo que cuenta la historia y el contexto queda
 * en gris. Sigue siendo un solo tono; lo que cambia es el enfasis.
 */
export function ColumnChart({
  columns,
  currency = "ARS",
}: {
  columns: Column[];
  currency?: string;
}) {
  if (columns.length === 0) return null;

  const maximo = Math.max(...columns.map((c) => c.value), 0);
  const tope = axisMax(maximo);
  const ticks = niceTicks(maximo);

  const paso = ANCHO_BARRA + GAP * 6;
  const ancho = EJE + PAD + columns.length * paso;
  const alto = ALTO + ARRIBA + ABAJO;
  const base = ARRIBA + ALTO;

  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      className="h-auto w-full"
      style={{ maxWidth: `${ancho * 1.6}px` }}
      role="img"
      aria-label={`Comprometido por mes, de ${columns[0].label} a ${columns[columns.length - 1].label}`}
    >
      {/* Grilla al hilo y solida: tiene que quedar atras del dato. */}
      {ticks.map((t) => {
        const y = base - (t / tope) * ALTO;
        return (
          <g key={t}>
            <line
              x1={EJE}
              y1={y}
              x2={ancho}
              y2={y}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={EJE - 6}
              y={y + 3}
              textAnchor="end"
              className="tabular"
              fontSize={9}
              fill="var(--muted)"
            >
              {formatCompact(t)}
            </text>
          </g>
        );
      })}

      {columns.map((col, i) => {
        const h = tope === 0 ? 0 : (col.value / tope) * ALTO;
        const x = EJE + PAD + i * paso + GAP * 3;
        const y = base - h;
        return (
          <g key={col.label}>
            <path
              d={columnPath(x, y, ANCHO_BARRA, h)}
              fill={col.muted ? "var(--chart-track)" : "var(--accent)"}
            >
              <title>{col.title}</title>
            </path>
            {h > 0 ? (
              <text
                x={x + ANCHO_BARRA / 2}
                y={y - 4}
                textAnchor="middle"
                className="tabular"
                fontSize={9}
                fill="var(--foreground)"
              >
                {formatCompact(col.value, i === 0 ? currency : undefined)}
              </text>
            ) : null}
            <text
              x={x + ANCHO_BARRA / 2}
              y={base + 13}
              textAnchor="middle"
              fontSize={9}
              fill="var(--muted)"
            >
              {col.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** El total, para el pie del grafico. */
export function totalOf(columns: Column[], currency: string): string {
  return formatCents(
    columns.reduce((t, c) => t + c.value, 0),
    currency,
  );
}
