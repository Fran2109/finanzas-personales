"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type Opcion = { value: string; label: string };

/**
 * Un filtro de varios valores.
 *
 * Un `<select multiple>` nativo resuelve esto en una linea, pero se usa con
 * ctrl+click, no dice cuantos hay elegidos sin mirarlo entero y en un telefono
 * es inusable. Asi que es un boton que dice como quedo el filtro y un panel de
 * casillas.
 *
 * Cada casilla navega en el momento en vez de juntar cambios y aplicarlos al
 * cerrar: el estado del filtro vive en la URL, y guardarlo aparte mientras el
 * panel esta abierto seria tener el mismo dato en dos lados. El panel queda
 * abierto porque la navegacion del App Router no desmonta el componente.
 */
export function MultiSelect({
  etiqueta,
  todos,
  plural,
  opciones,
  seleccion,
  onChange,
}: {
  /** Para lectores de pantalla: "Cuenta". */
  etiqueta: string;
  /** Lo que dice cuando no hay nada elegido: "Toda cuenta". */
  todos: string;
  /** Para el resumen cuando hay varios: "cuentas". */
  plural: string;
  opciones: Opcion[];
  seleccion: string[];
  onChange: (valores: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    function alClickear(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }

    document.addEventListener("mousedown", alClickear);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alClickear);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  // Con uno elegido se muestra cual: "3 cuentas" obliga a abrir el panel para
  // saber algo que entra en el boton.
  const resumen =
    seleccion.length === 0
      ? todos
      : seleccion.length === 1
        ? (opciones.find((o) => o.value === seleccion[0])?.label ?? todos)
        : `${seleccion.length} ${plural}`;

  function alternar(value: string) {
    onChange(
      seleccion.includes(value)
        ? seleccion.filter((v) => v !== value)
        : [...seleccion, value],
    );
  }

  /**
   * Corre el panel lo justo para que no se salga de la pantalla.
   *
   * El panel se ancla al gatillo, y un gatillo que quedo a la derecha lo manda
   * afuera: `max-w` limita el ancho pero no la posicion. Anclarlo a la derecha
   * tampoco alcanza —un gatillo angosto y centrado se sale para el otro lado,
   * porque el panel mide mas que media pantalla a 320px— asi que se mide y se
   * corre. **Esto CSS no lo puede preguntar**: depende de donde quedo el
   * gatillo despues de que la barra de filtros envolvio.
   *
   * Va directo al nodo y no por estado: es una correccion de layout, no algo
   * que la app tenga que recordar, y como estado ademas obligaria a un
   * setState dentro del efecto.
   */
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!abierto || !el) return;

    const acomodar = () => {
      // Se mide sin corrimiento previo, o cada medicion partiria de la
      // anterior y se acumularian.
      el.style.transform = "";
      const caja = el.getBoundingClientRect();
      const margen = 8;
      const sobra = caja.right - (document.documentElement.clientWidth - margen);
      const falta = margen - caja.left;
      const corrimiento = sobra > 0 ? -sobra : falta > 0 ? falta : 0;
      if (corrimiento) el.style.transform = `translateX(${corrimiento}px)`;
    };

    acomodar();
    // Girar el telefono con el panel abierto lo dejaba corrido de mas.
    window.addEventListener("resize", acomodar);
    return () => window.removeEventListener("resize", acomodar);
  }, [abierto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-label={etiqueta}
        className={`flex max-w-56 items-center gap-1.5 rounded-md border bg-surface px-2 py-1.5 text-xs transition ${
          seleccion.length > 0
            ? "border-accent text-foreground"
            : "border-border text-muted hover:text-foreground"
        }`}
      >
        <span className="truncate">{resumen}</span>
        <span aria-hidden className="shrink-0 opacity-60">
          &#9662;
        </span>
      </button>

      {abierto ? (
        <div
          ref={panel}
          className="panel-abre absolute left-0 z-20 mt-1 max-h-72 w-56 max-w-[calc(100vw-2rem)] overflow-auto rounded-md border border-border bg-surface p-1 shadow-lg"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={seleccion.length === 0}
            className="w-full rounded px-2 py-1.5 text-left text-xs text-accent hover:bg-background disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {todos}
          </button>

          <div className="my-1 border-t border-border" />

          {opciones.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-background"
            >
              <input
                type="checkbox"
                checked={seleccion.includes(o.value)}
                onChange={() => alternar(o.value)}
                className="accent-current"
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
