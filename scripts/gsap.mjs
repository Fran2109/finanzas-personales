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

// 3, 4 y 5 ------------------------------ en cada pantalla que monta la orquesta
//
// Las tres preguntas van juntas y en ese orden a proposito: sin "anima", el
// "nada invisible" lo estaria dando el watchdog y el ok seria mentira.
for (const pantalla of ["mes", "analisis"]) {
  const p = await b.newPage();
  await p.goto(`${BASE}/verificacion?p=${pantalla}`);

  // A los 120ms la secuencia esta arrancando.
  await p.waitForTimeout(120);
  const entrando = await p.evaluate(
    () =>
      [...document.querySelectorAll("[data-anim]")].filter(
        (el) => Number(getComputedStyle(el).opacity) < 0.99,
      ).length,
  );

  await p.waitForTimeout(1400);
  const fin = await p.evaluate(() => {
    const todos = [...document.querySelectorAll("[data-anim]")];
    return {
      n: todos.length,
      malos: todos
        .filter((el) => Number(getComputedStyle(el).opacity) < 0.99)
        .map((el) => el.getAttribute("data-anim")),
    };
  });

  if (fin.n === 0) mal(pantalla, "no hay ningun [data-anim]: la coreografia no engancho a nada");
  else if (entrando === 0) mal(pantalla, "a los 120ms ya estaba todo opaco: no hubo animacion");
  else if (fin.malos.length) mal(pantalla, `quedaron en opacidad < 1: ${fin.malos.join(", ")}`);
  else ok(`${pantalla}: ${entrando} de ${fin.n} entrando a los 120ms, los ${fin.n} opacos al final`);
  await p.close();

  const q = await b.newPage({ reducedMotion: "reduce" });
  await q.goto(`${BASE}/verificacion?p=${pantalla}`);
  await q.waitForTimeout(120);
  const quietos = await q.evaluate(() => {
    const todos = [...document.querySelectorAll("[data-anim]")];
    return todos.filter((el) => {
      const st = getComputedStyle(el);
      return Number(st.opacity) < 0.99 || (st.transform !== "none" && st.transform !== "");
    }).length;
  });
  if (quietos > 0) mal(`${pantalla} reduce`, `${quietos} elementos movidos o transparentes`);
  else ok(`${pantalla} reduce: quietos y opacos desde el primer frame`);
  await q.close();
}

// 6 --------------------------- una vez por pantalla: ni de menos ni de mas
//
// Todo en una sola carga, que es donde vive el bug: los chequeos de arriba
// abren una pestana nueva cada vez y por eso no lo verian nunca.
{
  const p = await b.newPage();
  const entrando = () =>
    p.evaluate(
      () =>
        [...document.querySelectorAll("[data-anim]")].filter(
          (el) => Number(getComputedStyle(el).opacity) < 0.99,
        ).length,
    );

  await p.goto(`${BASE}/verificacion?p=mes`);
  await p.waitForTimeout(1200);

  // Se mide **desde que la pantalla nueva aparece**, no a los N ms del click:
  // entre medio hay un viaje al servidor por el RSC y la view transition, que
  // retrasa el commit hasta que el navegador saca la foto. Con un timeout fijo
  // lo que se mide es la pantalla vieja, y el chequeo reporta "no animo" sobre
  // una animacion que estaba por empezar. Paso.
  //
  // Y no alcanza con una sola lectura al aparecer: entre que React commitea el
  // DOM y que corre el efecto que arranca GSAP hay una ventana en la que todo
  // esta en opacidad 1. Una muestra sola cae ahi una de cada tres veces, y el
  // chequeo miente en las dos direcciones. Se muestrea la ventana entera y se
  // pregunta si **en algun momento** hubo algo entrando.
  const ir = async (destino, titulo) => {
    await p.locator(`nav a[href*="p=${destino}"]`).click();
    await p.locator(`h1:has-text("${titulo}")`).waitFor({ timeout: 5000 });
    let maximo = 0;
    const hasta = Date.now() + 500;
    while (Date.now() < hasta) maximo = Math.max(maximo, await entrando());
    return maximo;
  };

  const primera = await ir("analisis", "Análisis");
  await p.waitForTimeout(1200);
  const vuelta = await ir("mes", "Septiembre");
  await p.waitForTimeout(1200);
  const revuelta = await ir("analisis", "Análisis");

  if (primera === 0) mal("una por pantalla", "Analisis no animo la primera vez que se vio");
  else if (vuelta > 0) mal("una por pantalla", `volver a Mes repitio la entrada (${vuelta})`);
  else if (revuelta > 0) mal("una por pantalla", `volver a Analisis la repitio (${revuelta})`);
  else ok(`una por pantalla: Analisis entro con ${primera}, y ninguna de las dos vueltas repitio`);
  await p.close();
}

// 7 ----------------------------------------------------------- el contador
//
// Tres preguntas, una por cada forma que tiene de fallar. Y en este orden: sin
// la primera, las otras dos pasan con el contador roto.
for (const pantalla of ["mes", "analisis"]) {
  // Lo que mando el servidor, que es lo que se ve sin JS y lo que tiene que
  // quedar al final. Se lee con el JS apagado para que sea el HTML y no el DOM
  // ya tocado por la animacion.
  const ctx = await b.newContext({ javaScriptEnabled: false });
  const sinJs = await ctx.newPage();
  await sinJs.goto(`${BASE}/verificacion?p=${pantalla}`);
  const servidor = (await sinJs.locator("[data-contador]").first().textContent())?.trim();
  await ctx.close();

  const p = await b.newPage();
  await p.goto(`${BASE}/verificacion?p=${pantalla}`);

  const medir = () =>
    p.evaluate(() => {
      const el = document.querySelector("[data-contador]");
      const linea = el?.closest("p");
      return {
        texto: (el?.textContent ?? "").trim(),
        ancho: linea ? Math.round(linea.getBoundingClientRect().width) : 0,
      };
    });

  // A los 200ms el tramo va por la mitad.
  await p.waitForTimeout(200);
  const medio = await medir();
  await p.waitForTimeout(1400);
  const fin = await medir();
  await p.close();

  if (!servidor || servidor === "$ 0,00") mal(`contador ${pantalla}`, `el servidor mando "${servidor}"`);
  else if (medio.texto === fin.texto) mal(`contador ${pantalla}`, `no conto: a los 200ms ya decia "${fin.texto}"`);
  else if (fin.texto !== servidor) mal(`contador ${pantalla}`, `termino en "${fin.texto}" y el servidor mando "${servidor}"`);
  else if (medio.ancho !== fin.ancho) mal(`contador ${pantalla}`, `la oracion se movio: ${medio.ancho}px a mitad de cuenta, ${fin.ancho}px al final`);
  else ok(`contador ${pantalla}: "${medio.texto}" -> "${fin.texto}", la linea quieta en ${fin.ancho}px`);
}

await b.close();

if (fallos.length) {
  console.error(`\n${fallos.length} problema(s).`);
  process.exit(1);
}
console.log("\nGSAP anima donde tiene que animar, no se cobra donde no, y no puede dejar nada invisible.");
