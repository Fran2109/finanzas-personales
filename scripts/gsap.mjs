/**
 * Lo que GSAP cuesta, y lo que no puede romper.
 *
 * Cuatro preguntas, todas medidas contra el navegador y no deducidas de un
 * manifiesto: bajo Turbopack los chunks por pagina no figuran en ninguno, y un
 * chequeo que lee el archivo equivocado responde que si a todo.
 *
 *   1. Las rutas que no animan, no lo pagan.
 *   2. Si el chunk no llega, la pagina se lee igual.
 *   3. Nada queda invisible cuando si llega.
 *   4. Bajo reduced-motion no se mueve nada.
 *
 *   npm run build && VERIFICACION=1 npx next start -p 3210
 *   node scripts/gsap.mjs
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
/** Como se reconoce el chunk de GSAP entre los que pide una pagina. */
const ES_GSAP = /gsap/i;

const fallos = [];
const ok = (m) => console.log(`  ok    ${m}`);
const mal = (q, d) => {
  fallos.push(`${q}: ${d}`);
  console.error(`  FALLA ${q} — ${d}`);
};

const b = await chromium.launch();

/** Que chunks de JS pide una pagina, y cuales de esos traen GSAP. */
async function chunks(url) {
  const p = await b.newPage();
  const pedidos = [];
  p.on("response", async (r) => {
    const u = r.url();
    if (!u.endsWith(".js")) return;
    try {
      const cuerpo = await r.text();
      pedidos.push({ u, gsap: ES_GSAP.test(cuerpo), bytes: cuerpo.length });
    } catch {
      // Un chunk que no se pudo leer no cuenta como que trae GSAP.
    }
  });
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.close();
  return pedidos;
}

// 1 ------------------------------------------- quien paga el chunk y quien no
{
  const conOrquesta = await chunks(`${BASE}/verificacion?p=mes`);
  const sinOrquesta = await chunks(`${BASE}/login`);
  const traeCon = conOrquesta.filter((x) => x.gsap);
  const traeSin = sinOrquesta.filter((x) => x.gsap);

  if (traeCon.length === 0) mal("costo", "la pantalla que anima no bajo GSAP: la orquesta no esta montada");
  else if (traeSin.length > 0) mal("costo", `/login bajo GSAP igual (${traeSin.map((x) => x.u).join(", ")})`);
  else {
    const kb = Math.round(traeCon.reduce((t, x) => t + x.bytes, 0) / 1024);
    ok(`costo: ${kb} KB sin comprimir en la pantalla que anima, 0 en /login`);
  }
}

// 2 ------------------------------------- el telefono que recibio el HTML y nada
{
  const p = await b.newPage();
  // Exactamente el caso del plan: llego el documento, el chunk no. El chunk no
  // se reconoce por el nombre del archivo —Turbopack los nombra con un hash— asi
  // que se pide, se mira lo que vuelve, y se corta el que trae GSAP.
  await p.route("**/*.js", async (r) => {
    const res = await r.fetch().catch(() => null);
    if (!res) return r.abort();
    const cuerpo = await res.text();
    if (ES_GSAP.test(cuerpo) && cuerpo.length > 50000) return r.abort();
    return r.fulfill({ response: res, body: cuerpo });
  });

  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(1600);
  const invisibles = await p.evaluate(() =>
    [...document.querySelectorAll("[data-anim]")].filter(
      (el) => Number(getComputedStyle(el).opacity) < 0.99,
    ).length,
  );
  const texto = (await p.locator("body").innerText()).trim().length;
  if (invisibles > 0) mal("sin chunk", `${invisibles} elementos quedaron invisibles`);
  else if (texto < 200) mal("sin chunk", `la pagina quedo casi vacia (${texto} caracteres)`);
  else ok(`sin chunk: el watchdog destapo todo, ${texto} caracteres a la vista`);
  await p.close();
}

// 3 ------------------------------------------ y nada invisible cuando si llega
{
  const p = await b.newPage();
  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const todos = [...document.querySelectorAll("[data-anim]")];
    return {
      n: todos.length,
      malos: todos
        .filter((el) => Number(getComputedStyle(el).opacity) < 0.99)
        .map((el) => el.getAttribute("data-anim")),
    };
  });
  if (r.n === 0) mal("visibilidad", "no hay ningun [data-anim]: la coreografia no engancho a nada");
  else if (r.malos.length) mal("visibilidad", `quedaron en opacidad < 1: ${r.malos.join(", ")}`);
  else ok(`visibilidad: los ${r.n} [data-anim] terminan opacos`);
  await p.close();
}

// 4 ------------------------------------------------ y que de verdad se anime
{
  const p = await b.newPage();
  await p.goto(`${BASE}/verificacion?p=mes`);
  // A los 120ms la secuencia esta arrancando: si ya esta todo opaco, GSAP no
  // hizo nada y el "ok" de arriba lo estaria dando el watchdog.
  await p.waitForTimeout(120);
  const medio = await p.evaluate(
    () =>
      [...document.querySelectorAll("[data-anim]")].filter(
        (el) => Number(getComputedStyle(el).opacity) < 0.99,
      ).length,
  );
  if (medio === 0) mal("anima", "a los 120ms ya estaba todo opaco: no hubo animacion");
  else ok(`anima: ${medio} elementos todavia entrando a los 120ms`);
  await p.close();
}

// 5 ------------------------------------------------------- y bajo reduce, nada
{
  const p = await b.newPage({ reducedMotion: "reduce" });
  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(120);
  const r = await p.evaluate(() => {
    const todos = [...document.querySelectorAll("[data-anim]")];
    return {
      n: todos.length,
      malos: todos.filter((el) => {
        const s = getComputedStyle(el);
        return Number(s.opacity) < 0.99 || (s.transform !== "none" && s.transform !== "");
      }).length,
    };
  });
  if (r.malos > 0) mal("reduce", `${r.malos} de ${r.n} elementos estaban movidos o transparentes`);
  else ok(`reduce: los ${r.n} [data-anim] estan quietos y opacos desde el primer frame`);
  await p.close();
}

// 6 -------------------------------------------- pero una sola vez por carga
{
  const p = await b.newPage();
  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(1200);
  // Ida y vuelta por una pantalla que no anima: al volver, la orquesta se
  // remonta. Si la secuencia se repitiera, serian 700ms de espera cada vez que
  // alguien va a Cuentas y vuelve.
  await p.locator('nav a[href*="p=cuentas"]').click();
  await p.waitForTimeout(600);
  await p.locator('nav a[href*="p=mes"]').click();
  await p.waitForTimeout(120);
  const r = await p.evaluate(() => {
    const todos = [...document.querySelectorAll("[data-anim]")];
    return {
      n: todos.length,
      entrando: todos.filter((el) => Number(getComputedStyle(el).opacity) < 0.99).length,
    };
  });
  if (r.n === 0) mal("una sola vez", "la vuelta no renderizo la pantalla del mes");
  else if (r.entrando > 0) mal("una sola vez", `la entrada se repitio (${r.entrando} entrando)`);
  else ok(`una sola vez: al volver, los ${r.n} [data-anim] ya estan puestos`);
  await p.close();
}

await b.close();

if (fallos.length) {
  console.error(`\n${fallos.length} problema(s).`);
  process.exit(1);
}
console.log("\nGSAP anima donde tiene que animar, no se cobra donde no, y no puede dejar nada invisible.");
