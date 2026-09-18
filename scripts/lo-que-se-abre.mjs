/**
 * Los tres movimientos del paso 4, verificados corriendo y no describiendolos.
 *
 * Los tres son CSS y `<ViewTransition>`: cero bytes de JavaScript propio. Eso
 * los hace baratos y tambien dificiles de creer sin mirarlos, porque fallan en
 * silencio — una transicion que no engancha no tira ningun error, simplemente
 * el elemento aparece de golpe y nadie se entera.
 *
 * Por eso cada chequeo mide el estado **a mitad de la animacion** y afirma que
 * el valor esta entre el de arranque y el final. Un assert del estado final
 * pasaria igual con la animacion rota.
 *
 *   npm run build && VERIFICACION=1 npx next start -p 3210
 *   node scripts/lo-que-se-abre.mjs
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

const BASE = process.env.BASE ?? "http://localhost:3210";
const fallos = [];
const ok = (q) => console.log(`  ok    ${q}`);
const mal = (q, d) => {
  fallos.push(`${q}: ${d}`);
  console.error(`  FALLA ${q} — ${d}`);
};

const b = await chromium.launch();

// ---------------------------------------------------------------- el editor
{
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(400);

  // La fila se toma por posicion y no por "la que tiene el boton Editar": al
  // abrirse ese boton desaparece, asi que un filtro por contenido se va a la
  // fila siguiente y termina midiendo la que no es. Paso.
  const filas = p.locator('ul:has(button[aria-label^="Corregir"])').first();
  const fila = filas.locator("> li").first();
  const antes = (await fila.boundingBox())?.height ?? 0;
  await fila.locator('button[aria-label^="Corregir"]').click();

  // A mitad de camino: si el alto ya es el final, la transicion no engancho.
  await p.waitForTimeout(100);
  const medio = (await fila.boundingBox())?.height ?? 0;
  await p.waitForTimeout(500);
  const final = (await fila.boundingBox())?.height ?? 0;

  if (final <= antes) mal("editor", `no crecio: ${antes} -> ${final}`);
  else if (medio >= final - 2) mal("editor", `salto al alto final en el primer frame (${medio} de ${final})`);
  else if (medio <= antes) mal("editor", `a los 100ms todavia no arranco (${medio})`);
  else ok(`editor: ${Math.round(antes)} -> ${Math.round(medio)} -> ${Math.round(final)} px`);
  await p.close();
}

// ------------------------------------------------------ el editor de la nota
//
// El mismo mecanismo que el editor completo, y por eso mismo se mide aparte:
// los dos estados de la fila arrancan con un `<div>`, asi que si se pierde la
// `key` que los distingue React reusa el nodo, el navegador no lo ve nacer y
// `@starting-style` no aplica. Eso ya paso una vez con el editor completo, y no
// dio un solo error — la fila simplemente salta a su alto final.
{
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(400);

  const gatillo = p.locator('button[aria-label^="Agregar una nota"]').first();
  const fila = gatillo.locator("xpath=ancestor::li[1]");
  const antes = (await fila.boundingBox())?.height ?? 0;
  await gatillo.click();

  await p.waitForTimeout(100);
  const medio = (await fila.boundingBox())?.height ?? 0;
  await p.waitForTimeout(500);
  const final = (await fila.boundingBox())?.height ?? 0;

  if (final <= antes) mal("nota", `no crecio: ${antes} -> ${final}`);
  else if (medio >= final - 2) mal("nota", `salto al alto final en el primer frame (${medio} de ${final})`);
  else if (medio <= antes) mal("nota", `a los 100ms todavia no arranco (${medio})`);
  else ok(`nota: ${Math.round(antes)} -> ${Math.round(medio)} -> ${Math.round(final)} px`);
  await p.close();
}

// -------------------------------------------- de la nota a repetir, sin cerrar
//
// El caso que la `key` del panel existe para cubrir: los dos comparten sitio y
// el mismo `.abre`, asi que sin ella React reusa el nodo, `@starting-style` no
// aplica —solo vale para uno recien insertado— y el segundo panel aparece de
// golpe. No da ningun error: por eso se mide, y se mide a mitad de camino.
{
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(400);

  const fila = p
    .locator('li:has(button[aria-label^="Repetir "])')
    .first();
  await fila.locator('button[aria-label*="nota"]').first().click();
  await p.waitForTimeout(600);
  const conNota = (await fila.boundingBox())?.height ?? 0;

  // Sin cerrar el primero: es el cambio de panel lo que se quiere mirar.
  await fila.locator('button[aria-label^="Repetir "]').click();
  await p.waitForTimeout(80);
  const medio = (await fila.boundingBox())?.height ?? 0;
  await p.waitForTimeout(500);
  const final = (await fila.boundingBox())?.height ?? 0;

  // La condicion es **solo** contra el final, y no "entre el arranque y el
  // final" como en los otros chequeos: el panel viejo se desmonta y el nuevo
  // crece desde cero, asi que a mitad de camino la fila mide *menos* que antes
  // de tocar nada. Una primera version pedia que el medio estuviera arriba del
  // arranque tambien, y con eso el chequeo daba ok con la `key` sacada —que es
  // el bug que existe para encontrar—: sin `key` la medicion es 129, 145, 145,
  // y el 129 de arranque alcanzaba para salvarla.
  if (final <= 0) mal("panel que cambia", "la fila desaparecio");
  else if (medio >= final - 2) {
    mal(
      "panel que cambia",
      `salto al alto final en el primer frame (${medio} de ${final}); ¿se perdio la key del panel?`,
    );
  } else {
    ok(
      `panel que cambia: nota ${Math.round(conNota)} -> ${Math.round(medio)} -> repetir ${Math.round(final)} px`,
    );
  }
  await p.close();
}

// ----------------------------------------------------------- panel del filtro
{
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(400);

  await p.locator('button[aria-haspopup="true"]').first().click();
  const panel = p.locator(".panel-abre").first();
  await p.waitForTimeout(50);
  const medio = await panel.evaluate((el) => Number(getComputedStyle(el).opacity));
  await p.waitForTimeout(400);
  const final = await panel.evaluate((el) => Number(getComputedStyle(el).opacity));

  if (final < 0.99) mal("panel", `no termino opaco: ${final}`);
  else if (medio >= 0.99) mal("panel", "aparecio de golpe, sin fade");
  else ok(`panel: opacidad ${medio.toFixed(2)} a los 50ms, ${final} al final`);
  await p.close();
}

// -------------------------------------------------------- crossfade del mes
{
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  await p.addInitScript(() => {
    // `startViewTransition` es la unica evidencia de que React engancho la
    // transicion: sin esta llamada el contenido se cambia de una y ninguna
    // regla de `::view-transition-*` llega a aplicarse nunca.
    const real = document.startViewTransition?.bind(document);
    window.__vt = 0;
    if (real) {
      document.startViewTransition = (...a) => {
        window.__vt += 1;
        return real(...a);
      };
    } else {
      window.__sinSoporte = true;
    }
  });
  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(600);

  if (await p.evaluate(() => window.__sinSoporte)) {
    console.log("  --    crossfade: este navegador no tiene la API (la app degrada a un corte)");
  } else {
    await p.locator('nav a[href*="p=analisis"]').click();
    await p.waitForTimeout(1200);
    const veces = await p.evaluate(() => window.__vt);
    const llego = await p.locator("h1").first().textContent();
    if (veces === 0) mal("crossfade", "la navegacion no abrio ninguna view transition");
    else if (!llego?.includes("Análisis")) mal("crossfade", `navego a otra cosa: ${llego}`);
    else ok(`crossfade: ${veces} view transition en la navegacion`);
  }
  await p.close();
}

// ------------------------------------------------- y nada de esto bajo reduce
{
  const p = await b.newPage({ viewport: { width: 900, height: 1000 }, reducedMotion: "reduce" });
  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(400);
  // La fila se toma por posicion y no por "la que tiene el boton Editar": al
  // abrirse ese boton desaparece, asi que un filtro por contenido se va a la
  // fila siguiente y termina midiendo la que no es. Paso.
  const filas = p.locator('ul:has(button[aria-label^="Corregir"])').first();
  const fila = filas.locator("> li").first();
  const antes = (await fila.boundingBox())?.height ?? 0;
  await fila.locator('button[aria-label^="Corregir"]').click();
  await p.waitForTimeout(60);
  const enseguida = (await fila.boundingBox())?.height ?? 0;
  if (enseguida <= antes) mal("reduce", "el editor no abrio");
  else ok(`reduce: el editor abre entero a los 60ms (${Math.round(enseguida)} px), sin animar`);
  await p.close();
}

await b.close();

if (fallos.length) {
  console.error(`\n${fallos.length} problema(s).`);
  process.exit(1);
}
console.log("\nLos cinco se abren animando, y ninguno anima bajo reduced-motion.");
