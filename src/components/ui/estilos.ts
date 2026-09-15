/**
 * Los strings de clases que estaban copiados por toda la app.
 *
 * **Strings y no componentes, a proposito.** Casi todo esto es una cadena de
 * utilidades de Tailwind, y envolver una cadena en un componente agrega un
 * `<div>` al arbol. En esta app eso es caro: un item de flex o de grid no baja
 * de su ancho de contenido, y un envoltorio de mas es la forma mas probable de
 * reintroducir los desbordes que costaron una auditoria entera de arreglar.
 * Lo unico que se gano ser componente es `Aviso`, porque el mapeo tono a clases
 * es logica y no un string.
 *
 * Es un modulo sin `"use client"`, asi que lo importan por igual los server
 * components y los de cliente, y Tailwind lo escanea como a cualquier archivo
 * de `src/`.
 *
 * Lo que este paso **no** hace es cambiar como se ve nada. El `uppercase` de
 * `etiqueta` se va, pero en el paso siguiente y con una sola edicion aca: si
 * algo se ve distinto despues de juntar los strings, es un error de la
 * extraccion y no una decision de diseno, y esa diferencia es lo que hace que
 * el diff se pueda revisar de un vistazo.
 */

/** El input de un formulario de pagina entera. */
export const campo =
  "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

/** El mismo input cuando vive adentro de una fila que ya esta sobre `surface`. */
export const campoCompacto =
  "w-full rounded-control border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

/** La etiqueta que va arriba de un campo. */
export const etiqueta = "block text-xs font-medium text-muted mb-1.5";

/** La misma etiqueta cuando el formulario esta adentro de una fila. */
export const etiquetaCompacta = "block text-micro font-medium text-muted mb-1";

/** El contenedor de una lista de filas. */
export const lista = "divide-y divide-border border-y border-border";

/** Cuando no hay nada que mostrar. Una pantalla vacia es una invitacion. */
export const vacio =
  "rounded-contenedor border border-dashed border-border px-4 py-10 text-center text-sm text-muted";

/**
 * El boton de la accion principal.
 *
 * Existia en tres versiones que se fueron separando solas: `SubmitButton` con
 * `transition disabled:opacity-50`, el de `error.tsx` sin transicion, y el de
 * confirmar un import con `opacity-40`. Nadie decidio que fueran distintos.
 */
export const botonAcento =
  "rounded-control bg-accent px-4 py-2 text-sm font-medium text-background transition disabled:opacity-50";

/**
 * El boton de un solo simbolo, casi siempre para borrar.
 *
 * El cuadrado de 32px no es estetico: sin el mide 12x20 y es a la vez dificil
 * de acertar con el dedo y destructivo cuando se acierta.
 */
export const botonIcono =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted transition hover:text-negative";

/**
 * La insignia que marca un estado en una fila.
 *
 * Sigue en mayusculas a proposito y no cae en la regla del eyebrow: no es una
 * etiqueta que anuncia el campo de abajo, es un sello. Que se lea distinto del
 * texto que la rodea es todo su trabajo.
 */
export const insignia =
  "shrink-0 rounded-pildora bg-accent/15 px-2 py-0.5 text-micro font-medium uppercase tracking-wide text-accent";

/**
 * El grid de contenido + columna lateral.
 *
 * `min-w-0` en las dos columnas no es opcional y va en cada sitio de uso: sin
 * el, un nombre largo ensancha su columna y se lleva puesta la pagina en un
 * telefono.
 */
export const gridDosColumnas = "grid gap-8 lg:grid-cols-[1fr_20rem]";

/** El boton de elegir entre pocas opciones, con estado. */
export function chip(activo: boolean): string {
  return `rounded-control border px-2.5 py-1.5 text-xs transition ${
    activo
      ? "border-accent bg-accent text-background"
      : "border-border bg-surface text-muted hover:text-foreground"
  }`;
}
