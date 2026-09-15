/**
 * Prueba que el contenido nunca puede quedar invisible.
 *
 * El CSS esconde lo que se va a animar, y si nada lo destapa la app se queda en
 * blanco sin un solo error en la consola. Es la falla que importa en una app de
 * plata, asi que tiene su propia prueba y no se confia en mirar la pantalla.
 *
 * Las tres capas que verifica:
 *   1. Con JS: esconde al arrancar y el watchdog lo destapa solo a los 900ms,
 *      pase lo que pase con la animacion.
 *   2. Bajo `prefers-reduced-motion`: no esconde nunca.
 *   3. Sin JS: la pagina se ve como si nada de esto existiera.
 *
 * Necesita playwright disponible (global o local) y el server levantado:
 *
 *   npm run build && npx next start -p 3210
 *   node scripts/red-de-motion.mjs http://localhost:3210/login
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
let chromium;
for (const ruta of ["playwright", "/opt/node22/lib/node_modules/playwright/index.js"]) {
  try {
    ({ chromium } = require_(ruta));
    break;
  } catch {
    // Se prueba la siguiente.
  }
}
if (!chromium) {
  console.error("No encontre playwright. Instalalo o pasa la ruta al modulo.");
  process.exit(1);
}

const URL = process.argv[2] ?? "http://localhost:3210/login";
const WATCHDOG_MS = 900;

/**
 * Inyecta un nodo animable en el momento y mira si la regla lo esconde.
 *
 * Se pregunta con un nodo nuevo en vez de buscar los `[data-anim]` de la pagina
 * porque asi la prueba sirve igual antes de que exista la primera animacion.
 */
const estado = (p) =>
  p.evaluate(() => {
    const el = document.createElement("div");
    el.setAttribute("data-anim", "seccion");
    document.body.appendChild(el);
    const escondido = getComputedStyle(el).opacity !== "1";
    el.remove();
    return {
      motion: document.documentElement.dataset.motion ?? null,
      vencido: document.documentElement.hasAttribute("data-motion-done"),
      escondido,
    };
  });

const b = await chromium.launch();
const fallas = [];

{
  const p = await b.newPage();
  await p.goto(URL);
  const antes = await estado(p);
  if (antes.motion !== "on") fallas.push("con JS no puso data-motion=on");
  if (antes.vencido) fallas.push("el watchdog disparo antes de tiempo");
  if (!antes.escondido) fallas.push("la regla no esconde [data-anim] en la ventana inicial");

  await p.waitForTimeout(WATCHDOG_MS + 300);
  const despues = await estado(p);
  if (!despues.vencido) fallas.push(`el watchdog no disparo a los ${WATCHDOG_MS}ms`);
  if (despues.escondido) fallas.push("despues del watchdog la regla sigue escondiendo");

  console.log(
    `1. con JS           motion=${antes.motion} vencido=${antes.vencido}->${despues.vencido} escondido=${antes.escondido}->${despues.escondido}`,
  );
  await p.close();
}

{
  const p = await b.newPage({ reducedMotion: "reduce" });
  await p.goto(URL);
  const r = await estado(p);
  if (r.motion !== null) fallas.push("bajo reduced-motion puso data-motion igual");
  if (r.escondido) fallas.push("bajo reduced-motion escondio contenido");
  console.log(`2. reduced-motion   motion=${r.motion} escondido=${r.escondido}`);
  await p.close();
}

{
  const ctx = await b.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(URL);
  // Sin JS no se puede preguntar por el DOM computado, asi que se mira lo unico
  // que importa: que el contenido este a la vista.
  const texto = (await p.locator("body").innerText()).trim();
  if (texto.length < 20) fallas.push("sin JS la pagina quedo vacia");
  console.log(`3. sin JS           ${texto.length} caracteres a la vista`);
  await ctx.close();
}

await b.close();

if (fallas.length) {
  console.error("\nFALLAS:\n- " + fallas.join("\n- "));
  process.exit(1);
}
console.log("\nLas tres capas ok: el contenido no puede quedar invisible.");
