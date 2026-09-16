/**
 * El unico lugar de la app que importa `gsap`.
 *
 * Es una regla de ESLint y no una convencion (ver `eslint.config.mjs`), porque
 * lo que sostiene esto por meses en un proyecto de una persona es un lint que
 * falla, no la buena memoria. Que el import este encerrado aca compra dos
 * cosas: `prefers-reduced-motion` se respeta en un solo `matchMedia` en vez de
 * en cada sitio de uso, y el dia que GSAP sobre, borrar este archivo y sus dos
 * importadores lo saca entero.
 *
 * Lo que **no** hace: dibujar. Los cuatro graficos siguen siendo server
 * components byte por byte; esto recibe el DOM ya pintado y lo mueve.
 */
import { gsap } from "gsap";

import { formatCents } from "./money";
import { plan, tramoContador, valorEn } from "./motion-plan";

/** Lo que hay que llamar para que el escondite del CSS deje de aplicar. */
function destapar() {
  document.documentElement.setAttribute("data-motion-done", "");
}

/**
 * Cada pantalla entra una sola vez por carga, y despues nunca mas.
 *
 * Volver a Mes desde Analisis remonta la orquesta, y sin esto la secuencia se
 * repetiria en cada ida y vuelta. Una entrada que se ve una vez es una entrada;
 * vista veinte veces en una tarde es un obstaculo de 700ms entre la persona y
 * sus numeros. Un recargar de verdad la trae de nuevo, que es cuando tiene
 * sentido: ahi la pantalla se esta armando otra vez.
 *
 * **Por pantalla y no una sola para toda la app**, que es lo que parecia
 * alcanzar: con una sola bandera, entrar a Analisis despues de Mes no animaba
 * nada, porque el flag ya estaba gastado. Ver una pantalla por primera vez y
 * volver a una que ya viste son cosas distintas.
 *
 * Es un `Set` de modulo y no `sessionStorage` a proposito: lo que hay que
 * recordar es "en esta carga", que es exactamente lo que dura un modulo.
 */
const yaEntraron = new Set<string>();

/**
 * Arma la entrada de una pantalla y devuelve como deshacerla.
 *
 * El orden de las dos primeras lineas es la parte que hay que entender, y por
 * eso esta escrita antes que nada:
 *
 * **Se destapa primero, se anima despues.** El CSS tiene los `[data-anim]` en
 * `opacity: 0`, y si `gsap.from(el, { opacity: 0 })` corriera con la regla
 * todavia activa, GSAP leeria el computado de ahora —0— como el valor **final**
 * y animaria de 0 a 0. El elemento queda invisible para siempre, sin un error,
 * en todos los navegadores. Destapar primero deja el computado en 1, que es el
 * final que corresponde, y `from()` se encarga de volver a 0 para arrancar.
 *
 * Y de paso: si cualquier cosa de aca para abajo tira, el contenido ya quedo
 * visible. La linea que rescata la pagina es la primera, no un catch.
 */
export function entrada(scope: HTMLElement, pantalla: string): () => void {
  destapar();

  if (yaEntraron.has(pantalla)) return () => {};
  yaEntraron.add(pantalla);

  /** Lo que hay que deshacer a mano porque GSAP no lo tiene anotado. */
  const restaurar: (() => void)[] = [];

  const mm = gsap.matchMedia();

  // El segundo de los tres lugares donde se respeta la preferencia. Con
  // `matchMedia` no hace falta preguntar: adentro de la rama que no matchea,
  // GSAP no crea ni una tween.
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

    for (const paso of plan()) {
      const elementos = scope.querySelectorAll(`[data-anim="${paso.target}"]`);
      if (elementos.length === 0) continue;

      tl.from(
        elementos,
        {
          ...formaDe(paso.target),
          duration: paso.dur / 1000,
          // `amount` y no `each`: reparte el arranque entre todos, asi la
          // secuencia dura lo mismo con 3 elementos que con 300 y no se pasa
          // del watchdog en un mes cargado. Ver `motion-plan.ts`.
          stagger: { amount: paso.spread / 1000 },
        },
        paso.at / 1000,
      );
    }

    for (const el of scope.querySelectorAll<HTMLElement>("[data-contador]")) {
      contar(tl, el, restaurar);
    }
  });

  // `revert()` borra **todo** estilo inline que GSAP haya escrito, asi que
  // desmontar a mitad de tween —dos toques rapidos en la flecha del mes— no
  // deja una fila en opacidad 0,3 para siempre.
  //
  // Lo que **no** deshace es el texto de los contadores: eso lo escribe un
  // `onUpdate` y GSAP no lo sabe. Por eso se restaura a mano, y por eso
  // `restaurar` existe: un numero parcial congelado es la unica forma que tiene
  // este paso de mentir.
  return () => {
    mm.revert();
    for (const f of restaurar) f();
  };
}

/**
 * De donde sale cada grupo, que es una decision distinta por grupo.
 *
 * **Las barras y las columnas no animan opacidad, y no es un olvido.** Las
 * cuatro viven adentro de una seccion que ya hace su fade, y dos opacidades
 * anidadas se multiplican: a mitad de camino 0,5 por 0,5 da 0,25 y el grafico
 * se ve sucio en vez de entrando. Ademas no compra nada: lo que tiene para
 * decir una barra es su largo, asi que lo que se anima es el largo.
 *
 * Y el eje es el de la magnitud, no siempre el mismo. Una barra acostada crece
 * en X —el largo es horizontal— y una columna en Y. `scaleY` en una barra
 * acostada la aplastaria de canto, que no es ver crecer un dato: es un efecto.
 *
 * El origen tambien sale del dato. Una barra crece desde el cero del eje, y en
 * `DivergingBars` el cero esta a la **derecha** de las barras que caen del lado
 * de "gastaste menos": esas crecen al reves y lo dicen con `data-crece`.
 */
function formaDe(target: string): gsap.TweenVars {
  if (target === "bar") {
    return {
      scaleX: 0,
      transformOrigin: (_i: number, el: Element) =>
        (el as HTMLElement).dataset.crece === "izquierda" ? "100% 50%" : "0% 50%",
    };
  }
  if (target === "col") return { scaleY: 0, transformOrigin: "50% 100%" };
  return { opacity: 0, y: target === "seccion" ? 8 : 0 };
}

/**
 * El numero que rueda de cero hasta el suyo, en el mismo reloj que el resto.
 *
 * Dos detalles que no son decoracion:
 *
 * **Se fija el ancho antes de arrancar.** `.cifra` ya trae `tabular-nums`, o
 * sea que los digitos miden todos igual — pero la *cantidad* de digitos cambia,
 * de "$ 0,00" a "$ 1.664.654,03", y el numero vive adentro de una oracion. Sin
 * esto, el punto final de "Gastaste $ X." se pasea por la pantalla durante medio
 * segundo. El elemento ya tiene el texto final puesto por el servidor, asi que
 * medirlo es leer el ancho de llegada; se descarta al terminar.
 *
 * **El valor lo redondea `valorEn`**, que es una funcion pura y testeada: lo que
 * se escribe en pantalla es plata, y un contador que pasa por 12.895,3947 y
 * despues corrige es peor que uno que no anima.
 */
function contar(
  tl: gsap.core.Timeline,
  el: HTMLElement,
  restaurar: (() => void)[],
): void {
  const cents = Number(el.dataset.contador);
  if (!Number.isFinite(cents)) return;
  const moneda = el.dataset.moneda || "ARS";
  const final = formatCents(cents, moneda);

  const ancho = el.getBoundingClientRect().width;
  const soltarAncho = () => {
    el.style.removeProperty("display");
    el.style.removeProperty("min-width");
  };
  el.style.display = "inline-block";
  el.style.minWidth = `${ancho}px`;

  restaurar.push(() => {
    soltarAncho();
    el.textContent = final;
  });

  const tramo = tramoContador();
  const reloj = { t: 0 };
  tl.to(
    reloj,
    {
      t: 1,
      duration: tramo.dur / 1000,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = formatCents(valorEn(reloj.t, cents), moneda);
      },
      onComplete: () => {
        // El ultimo frame no siempre cae justo en 1: se escribe el final tal
        // cual lo mando el servidor, no el que salga de redondear.
        el.textContent = final;
        soltarAncho();
      },
    },
    tramo.at / 1000,
  );
}
