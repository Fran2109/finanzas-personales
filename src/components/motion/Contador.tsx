import { formatCents, type Cents } from "@/lib/money";

/**
 * La cifra que es el argumento de una pantalla, y que cuenta desde cero.
 *
 * **Es un server component, y ahi esta todo el diseno.** Lo que renderiza es el
 * numero **final** —exactamente lo mismo que `Amount` con `tone="plain"`— mas
 * dos atributos `data-`. El "0" no existe en ningun HTML: sin JS, con el chunk
 * de GSAP muerto, o bajo `prefers-reduced-motion`, lo que queda en pantalla es
 * el valor correcto.
 *
 * Esa es la diferencia con el resto de las animaciones de la app. En las otras
 * la falla que hay que hacer imposible es "algo queda invisible"; aca seria
 * **un numero equivocado en pantalla**, que es peor: una app de plata que
 * muestra $ 0,00 donde se gastaron 1,6 millones no esta degradada, esta
 * mintiendo.
 *
 * Quien lo hace contar es `entrada()` en `src/lib/motion.ts`, que lo busca por
 * `data-contador` y lo mete en la misma timeline que todo lo demas. Asi el
 * contador no trae su propio reloj, que es justamente lo que GSAP compra aca.
 *
 * Son dos usos en toda la app y por eso es un componente aparte en vez de una
 * prop de `Amount`: `Amount` tiene 12 usos y varios viven adentro de listas de
 * ~40 filas, donde un contador por fila seria ridiculo.
 */
export function Contador({
  cents,
  currency = "ARS",
  className = "",
}: {
  cents: Cents;
  currency?: string;
  className?: string;
}) {
  return (
    <span data-contador={cents} data-moneda={currency} className={`tabular ${className}`}>
      {formatCents(cents, currency)}
    </span>
  );
}
