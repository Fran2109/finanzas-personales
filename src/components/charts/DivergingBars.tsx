import { formatCents, type Cents } from "@/lib/money";

export type DivergingItem = {
  label: string;
  value: Cents;
  hint?: string;
};

/**
 * Barras a los dos lados de un cero: cuanto subio y cuanto bajo.
 *
 * **Un solo tono, y el signo lo lleva la posicion.** Lo natural seria verde
 * para un lado y rojo para el otro, pero el validador de la skill de dataviz
 * los rechaza: ese par da dE 5,5 en claro y 4,0 en oscuro bajo deuteranopia, o
 * sea que un daltonico ve dos barras del mismo color y pierde el signo. De que
 * lado del cero cae la barra no se pierde nunca, y ademas el numero va con
 * signo al lado. El par azul/rojo que propone la skill pasaria el chequeo, pero
 * meter un tono nuevo en una app cuya paleta entera es un verde cuesta mas de
 * lo que rinde.
 */
export function DivergingBars({
  items,
  currency = "ARS",
  izquierda,
  derecha,
}: {
  items: DivergingItem[];
  currency?: string;
  /** Que significa caer a la izquierda del cero: "bajó". */
  izquierda: string;
  /** Y a la derecha: "subió". */
  derecha: string;
}) {
  if (items.length === 0) return null;

  const maximo = Math.max(...items.map((i) => Math.abs(i.value)), 1);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-muted">
        <span>&larr; {izquierda}</span>
        <span>{derecha} &rarr;</span>
      </div>

      <ul className="space-y-2.5">
        {items.map((item) => {
          const ancho = (Math.abs(item.value) / maximo) * 50;
          const sube = item.value > 0;
          return (
            <li key={item.label}>
              {/* Sin `flex-wrap`: con el, el importe se caia a la linea de
                  abajo y `justify-between` lo pegaba a la izquierda, lejos de
                  donde el ojo lo busca. Y el `truncate` del label no llegaba a
                  dispararse nunca, porque envolver lo hacia innecesario. Sin
                  wrap el importe queda fijo a la derecha y el label envuelve
                  adentro de su columna, que no pierde texto ni lo corre. */}
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 break-words">
                  {item.label}
                  {item.hint ? <span className="ml-1 text-muted">{item.hint}</span> : null}
                </span>
                {/* El signo va explicito: es la otra mitad de lo que dice la
                    posicion, y la unica que sobrevive si se lee la lista sola. */}
                <span className="tabular shrink-0 text-muted">
                  {sube ? "+" : "−"}
                  {formatCents(Math.abs(item.value), currency)}
                </span>
              </div>

              <div
                className="mt-1 flex h-3.5 w-full items-stretch"
                title={`${item.label}: ${sube ? derecha : izquierda} ${formatCents(Math.abs(item.value), currency)}`}
              >
                <div className="flex w-1/2 justify-end">
                  {!sube ? (
                    // Redondeada en la punta y cuadrada contra el cero, igual
                    // que en el resto de los graficos.
                    <div className="h-full rounded-l bg-accent" style={{ width: `${ancho * 2}%` }} />
                  ) : null}
                </div>
                <div className="w-px shrink-0 bg-border" aria-hidden />
                <div className="flex w-1/2 justify-start">
                  {sube ? (
                    <div className="h-full rounded-r bg-accent" style={{ width: `${ancho * 2}%` }} />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
