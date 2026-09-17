/**
 * Auditoria responsive punta a punta.
 *
 * Mide dos cosas distintas, y la segunda es la que encuentra los bugs buenos:
 * `scrollWidth` contra el viewport (la pagina desborda) **y** elemento por
 * elemento (un hijo se sale aunque la pagina no scrollee, porque un ancestro lo
 * recorta — eso no es un desborde, es informacion que desaparece).
 *
 * Y no alcanza con el estado inicial: los desbordes que quedaban estaban en lo
 * que se abre. Por eso tambien hace click y vuelve a medir.
 *
 * Los breakpoints de Tailwind miran el **viewport**, no el contenedor, asi que
 * cada ancho se mira metiendo la pagina en un `<iframe>` de ese ancho: achicar
 * un div dejaria los `sm:` y `lg:` activos y la prueba mentiria. Chrome headless
 * tampoco sirve directo, que clampea la ventana en ~500px.
 *
 * Corre con `reducedMotion: "reduce"` a proposito: sin eso cada captura y cada
 * medicion caen en un frame al azar de una animacion y el resultado deja de ser
 * deterministico.
 *
 *   npm run build && VERIFICACION=1 npx next start -p 3210
 *   node scripts/responsive.mjs
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
// 320 es el telefono chico de verdad y es el peor caso; 1920 es un monitor.
const ANCHOS = [320, 375, 414, 667, 768, 1024, 1280, 1920];
const PANTALLAS = ["mes", "analisis", "cuentas", "ajustes", "importar", "revision", "login"];
/** Menos de esto no se acierta con el dedo. */
const TARGET_MIN = 28;

const problemas = [];

/** Lo que se sale de la caja, y lo que es muy chico para tocar. */
const medir = (f) =>
  f.evaluate((min) => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    /**
     * Un recorte con elipsis es intencional, y hay que distinguirlo.
     *
     * El chequeo elemento por elemento existe para agarrar informacion que
     * desaparece sin que la pagina scrollee. Pero tiene una asimetria: si la
     * cola de un `truncate` es texto pelado no la ve, y si es un `<span>` —para
     * pintarla distinto— la reporta como desborde. Lo mismo en pantalla, dos
     * respuestas distintas.
     *
     * `text-overflow: ellipsis` es una declaracion explicita de "aca la linea
     * se corta a proposito", asi que lo que caiga adentro de uno no cuenta. Un
     * ancestro que recorta **sin** elipsis sigue contando: ahi el contenido
     * desaparece sin avisar, que es justo lo que hay que encontrar.
     */
    const recortadoAProposito = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.textOverflow === "ellipsis" && /hidden|clip/.test(s.overflowX)) return true;
      }
      return false;
    };

    const fuera = [];
    for (const el of document.querySelectorAll("body *")) {
      const c = el.getBoundingClientRect();
      if (c.width === 0 && c.height === 0) continue;
      if (recortadoAProposito(el)) continue;
      if (c.right > vw + 1 || c.left < -1) {
        fuera.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.toString?.() ?? "").slice(0, 60),
          izq: Math.round(c.left),
          der: Math.round(c.right),
          txt: (el.textContent ?? "").trim().slice(0, 35),
        });
      }
    }
    const chicos = [];
    for (const el of document.querySelectorAll("button, a, select, input, textarea")) {
      // Lo que importa es lo que se puede tocar, no el control. Un checkbox de
      // 13px adentro de un `<label>` de fila entera se toca en toda la fila:
      // medir el input daria un falso positivo en cada opcion de cada filtro.
      const objetivo = el.closest("label") ?? el;
      const c = objetivo.getBoundingClientRect();
      if (c.width === 0 && c.height === 0) continue;
      if (c.height < min || c.width < 20) {
        chicos.push({
          tag: el.tagName.toLowerCase(),
          w: Math.round(c.width),
          h: Math.round(c.height),
          txt: (objetivo.textContent || el.getAttribute("aria-label") || "")
            .trim()
            .slice(0, 30),
        });
      }
    }
    return { vw, scroll: de.scrollWidth, fuera: fuera.slice(0, 4), chicos: chicos.slice(0, 4) };
  }, TARGET_MIN);

const revisar = (r, donde) => {
  if (r.scroll > r.vw + 1 || r.fuera.length) {
    problemas.push({ donde, tipo: "desborde", scroll: r.scroll, vw: r.vw, fuera: r.fuera });
  }
  if (r.chicos.length) problemas.push({ donde, tipo: "target chico", targets: r.chicos });
};

const b = await chromium.launch();

for (const tema of ["light", "dark"]) {
  for (const w of ANCHOS) {
    const p = await b.newPage({
      viewport: { width: w + 60, height: 1600 },
      colorScheme: tema,
      reducedMotion: "reduce",
    });

    const abrir = async (pantalla) => {
      await p.setContent(
        `<body style="margin:0"><iframe src="${BASE}/verificacion?p=${pantalla}" width="${w}" height="1600" style="border:0;display:block"></iframe></body>`,
      );
      await p.waitForTimeout(500);
      return p.frames().find((x) => x.url().includes("verificacion"));
    };

    for (const pantalla of PANTALLAS) {
      const f = await abrir(pantalla);
      if (!f) {
        problemas.push({ donde: `${tema} ${w} ${pantalla}`, tipo: "no cargo" });
        continue;
      }
      // Los targets chicos no dependen del tema: se miran una vez.
      const r = await medir(f);
      if (tema === "light") r.chicos = [];
      revisar(r, `${tema} ${w} ${pantalla}`);
    }

    // Lo que se abre. Un click que no encuentra nada no falla, simplemente no
    // hace nada: por eso se afirma que la interaccion ocurrio.
    const f = await abrir("mes");
    if (f) {
      const gatillos = f.locator('button[aria-haspopup="true"]');
      const n = await gatillos.count();
      if (n === 0) problemas.push({ donde: `${tema} ${w}`, tipo: "no encontre los filtros" });
      for (let i = 0; i < n; i++) {
        await gatillos.nth(i).click();
        await p.waitForTimeout(250);
        revisar(await medir(f), `${tema} ${w} mes · filtro ${i} abierto`);
        await gatillos.nth(i).click();
        await p.waitForTimeout(120);
      }

      const f2 = await abrir("mes");
      await f2.locator('button[aria-label^="Corregir"]').first().click();
      await p.waitForTimeout(400);
      if ((await f2.locator('button:has-text("Guardar")').count()) === 0) {
        problemas.push({ donde: `${tema} ${w}`, tipo: "el editor no abrio" });
      }
      revisar(await medir(f2), `${tema} ${w} mes · editor abierto`);

      // El editor de solo la nota, que es el otro estado que se abre en una
      // fila. Se miran los dos gatillos porque no son el mismo control: el de
      // agregar lleva texto ("+ nota") y el de editar es un simbolo, asi que
      // ocupan anchos distintos en la linea que ya se recorta.
      for (const [gatillo, como] of [
        ['button[aria-label^="Agregar una nota"]', "sin nota"],
        ['button[aria-label^="Editar la nota"]', "con nota"],
      ]) {
        const f5 = await abrir("mes");
        await f5.locator(gatillo).first().click();
        await p.waitForTimeout(400);
        if ((await f5.locator('button:has-text("Guardar")').count()) === 0) {
          problemas.push({ donde: `${tema} ${w}`, tipo: `la nota (${como}) no abrio` });
        }
        revisar(await medir(f5), `${tema} ${w} mes · nota abierta (${como})`);
      }
    }

    // Cuentas tiene sus dos estados que se abren, y hasta ahora no los medía
    // nadie: el editor en linea de la fila y el confirmar de borrado, que es
    // donde vive el texto mas largo de la pantalla.
    const f3 = await abrir("cuentas");
    if (f3) {
      await f3.locator('button:has-text("Editar")').first().click();
      await p.waitForTimeout(300);
      if ((await f3.locator('button:has-text("Cancelar")').count()) === 0) {
        problemas.push({ donde: `${tema} ${w}`, tipo: "el editor de cuenta no abrio" });
      }
      revisar(await medir(f3), `${tema} ${w} cuentas · editor abierto`);

      const f4 = await abrir("cuentas");
      await f4.locator('button:has-text("Borrar")').first().click();
      await p.waitForTimeout(300);
      if ((await f4.locator('button:has-text("Si, borrar")').count()) === 0) {
        problemas.push({ donde: `${tema} ${w}`, tipo: "el confirmar de borrado no abrio" });
      }
      revisar(await medir(f4), `${tema} ${w} cuentas · borrado por confirmar`);
    }

    await p.close();
  }
}

await b.close();

if (problemas.length) {
  console.error(JSON.stringify(problemas, null, 1));
  console.error(`\n${problemas.length} problema(s).`);
  process.exit(1);
}
console.log(
  `Sin problemas: ${PANTALLAS.length} pantallas x ${ANCHOS.length} anchos x 2 temas, mas los estados que se abren.`,
);
