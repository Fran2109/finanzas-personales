import type { Metadata } from "next";
import "./globals.css";
import { WATCHDOG_MS } from "@/lib/motion-plan";

export const metadata: Metadata = {
  title: "Finanzas",
  description: "Control de finanzas personales",
};

/**
 * El interruptor de las animaciones, antes de la primera pintura.
 *
 * Hace dos cosas y las dos existen para que **nunca** quede contenido
 * invisible, que en una app de plata es la falla que importa:
 *
 * 1. Marca `data-motion="on"` en el `<html>`. El CSS esconde lo que se va a
 *    animar **solo** si ese atributo esta. Sin JS —o con el JS cortado a mitad
 *    de camino, que en un telefono con datos flojos no es hipotetico— el
 *    atributo nunca se pone, la regla nunca matchea y la pagina se ve como si
 *    nada de esto existiera. Es estructural, no una promesa.
 *
 * 2. Programa el vencimiento del escondite. A los `WATCHDOG_MS` el atributo
 *    `data-motion-done` deja la regla muerta para el resto de la vida del
 *    documento, haya pasado lo que haya pasado con GSAP. `<html>` no lo
 *    reemplaza ninguna navegacion del App Router, asi que es un flip
 *    permanente: todo nodo que aparezca despues del primer segundo ya no se
 *    esconde nunca, y no hay que resolver "los nodos que llegan tarde".
 *
 * Va inline y bloqueante a proposito: si corriera despues de la primera pintura
 * el contenido se veria y recien ahi se escondaria, que es el parpadeo al reves.
 *
 * Bajo `prefers-reduced-motion` no pone nada, asi que el estado inicial tampoco
 * aplica. Es el primero de los tres lugares donde se respeta esa preferencia.
 */
const INTERRUPTOR = `(function(){try{var d=document.documentElement;
if(!matchMedia("(prefers-reduced-motion: reduce)").matches)d.dataset.motion="on";
setTimeout(function(){d.setAttribute("data-motion-done","")},${WATCHDOG_MS})}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTERRUPTOR }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
