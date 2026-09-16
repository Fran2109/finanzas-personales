/**
 * La coreografia de la entrada, como datos.
 *
 * Vive aparte de GSAP y sin importarlo a proposito: asi los numeros se pueden
 * testear con `node --test`, que es lo unico que se puede testear de una
 * animacion sin montar un navegador. Lo que no se testea es como se ve; eso se
 * mira.
 *
 * `src/lib/motion.ts` arma la timeline desde aca y el script inline de
 * `src/app/layout.tsx` lee `WATCHDOG_MS` de aca. Que los dos numeros salgan del
 * mismo lugar es lo que permite que un test los ate.
 */
import type { Cents } from "./money.ts";

/**
 * Cuanto dura el escondite antes de vencerse solo.
 *
 * El CSS esconde lo que se va a animar, y esta marca lo deja de esconder pase
 * lo que pase. Si el chunk de GSAP no llega —un telefono con datos flojos que
 * recibio el HTML y nada mas— el contenido aparece igual, sin animar, tarde por
 * este tanto. Es la diferencia entre una degradacion y una app de plata que se
 * queda en blanco.
 */
export const WATCHDOG_MS = 900;

/** Un grupo de elementos que entra junto. */
export type Paso = {
  /** El valor de `data-anim` que lo marca en el DOM. */
  target: string;
  /** Cuando arranca, en ms desde el principio de la secuencia. */
  at: number;
  /** Cuanto dura cada elemento del grupo. */
  dur: number;
  /**
   * Cuanto se reparte el arranque **entre todos** los elementos del grupo.
   *
   * Es un total, no un incremento por elemento, y esa es la decision: con un
   * incremento, una lista de 40 movimientos tardaria 40 x 45ms = 1,8s solo en
   * arrancar, se pasaria del watchdog y la secuencia se cortaria por la mitad
   * en cualquier mes cargado. Repartido, la secuencia dura lo mismo con 3
   * elementos que con 300. En GSAP es `stagger: { amount }`, no `each`.
   */
  spread: number;
};

/**
 * La secuencia. Un solo momento orquestado y nada mas: la skill de diseno es
 * explicita en que una entrada por seccion es el default generico.
 */
const PASOS: readonly Paso[] = [
  // Las secciones primero, que son el esqueleto de la pagina.
  { target: "seccion", at: 0, dur: 260, spread: 180 },
  // El numero grande arranca casi con ellas: es el argumento de la pantalla.
  { target: "hero", at: 40, dur: 420, spread: 0 },
  // Las barras despues, cuando ya hay donde apoyarlas.
  { target: "bar", at: 140, dur: 380, spread: 120 },
  { target: "col", at: 140, dur: 420, spread: 140 },
];

export function plan(): readonly Paso[] {
  return PASOS;
}

/**
 * El tramo del contador del numero hero.
 *
 * Arranca **con** el hero porque es el mismo elemento, y por eso el `at` sale
 * de ahi y no de un numero escrito de nuevo: retunear la entrada mueve las dos
 * cosas juntas y no se pueden desfasar. Dura mas que el fade porque un numero
 * que rueda necesita tiempo para leerse y un fade no.
 */
export function tramoContador(): { at: number; dur: number } {
  const hero = PASOS.find((p) => p.target === "hero");
  return { at: hero ? hero.at : 0, dur: 620 };
}

/**
 * Cuanto tarda la secuencia entera.
 *
 * No depende de cuantos elementos haya —por `spread`— y eso es justamente lo
 * que hace que se pueda comparar contra el watchdog de una vez y para siempre.
 */
export function duracionTotal(): number {
  const c = tramoContador();
  return Math.max(c.at + c.dur, ...PASOS.map((p) => p.at + p.spread + p.dur));
}

/**
 * El valor que muestra el contador a mitad de camino.
 *
 * Redondea al centavo porque lo que se escribe en pantalla es plata, no un
 * float: un contador que pasa por 12.895,3947 y despues corrige es peor que uno
 * que no anima.
 */
export function valorEn(progreso: number, cents: Cents): Cents {
  if (progreso <= 0) return 0;
  if (progreso >= 1) return cents;
  return Math.round(cents * progreso);
}
