/**
 * Capturas de las pantallas, para probar que un cambio NO cambio nada.
 *
 * Sirve para los refactors que prometen ser puramente mecanicos: se saca una
 * baseline antes, se hace el cambio, se vuelve a sacar y se comparan. Si un
 * hash se movio, algo se vio distinto y hay que mirarlo — no alcanza con que
 * compile.
 *
 * Compara pixel por pixel y no por hash. El hash parece mas simple y es
 * inservible: el rasterizado del texto tiene ruido de antialiasing entre
 * corridas —medido, 18 pixeles sobre 900.000 en el borde izquierdo de una
 * letra— y un hash binario convierte ese ruido en una falla. El diff cuenta
 * cuantos pixeles cambiaron y donde, asi que distingue el ruido de un cambio
 * real por varios ordenes de magnitud.
 *
 * Sin dependencias: decodifica los dos PNG en un canvas del propio navegador,
 * que ya esta abierto.
 *
 *   npm run build && VERIFICACION=1 npx next start -p 3210
 *   node scripts/capturas.mjs /tmp/antes
 *   ... cambios ...
 *   node scripts/capturas.mjs /tmp/despues --contra /tmp/antes
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

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
const PANTALLAS = ["mes", "cuentas", "ajustes", "importar", "revision", "login"];
const TEMAS = ["light", "dark"];
/** Un ancho de escritorio y uno de telefono: el layout cambia entre los dos. */
const ANCHOS = [900, 375];

/**
 * Cuanto ruido se tolera antes de llamarlo cambio.
 *
 * El ruido medido es ~0,002% de los pixeles. Un cambio de verdad —un color, un
 * borde, un espaciado— mueve al menos dos ordenes de magnitud mas, asi que
 * 0,05% separa las dos cosas con margen de sobra para los dos lados.
 */
const TOLERANCIA = 0.0005;

const destino = process.argv[2];
if (!destino) {
  console.error("Falta el directorio destino.");
  process.exit(1);
}
const i = process.argv.indexOf("--contra");
const contra = i > -1 ? process.argv[i + 1] : null;

mkdirSync(destino, { recursive: true });

const b = await chromium.launch();
const nombres = [];

for (const tema of TEMAS) {
  for (const w of ANCHOS) {
    const p = await b.newPage({
      viewport: { width: w + 40, height: 2400 },
      colorScheme: tema,
      // Sin esto cada captura cae en un frame al azar de una animacion y la
      // comparacion deja de significar algo.
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });

    for (const pantalla of PANTALLAS) {
      await p.setContent(
        `<body style="margin:0"><iframe src="${BASE}/verificacion?p=${pantalla}" width="${w}" height="2400" style="border:0;display:block"></iframe></body>`,
      );
      const f = await p.waitForFunction(
        () => [...document.querySelectorAll("iframe")].length > 0,
      );
      await f.dispose();
      await p.waitForTimeout(700);

      const frame = p.frames().find((x) => x.url().includes("verificacion"));
      if (!frame) {
        console.error(`no cargo: ${pantalla} ${tema} ${w}`);
        continue;
      }
      // Las fuentes llegan asincronas: capturar antes las hace no
      // deterministicas, que es justo lo contrario de lo que esto busca.
      await frame.evaluate(() => document.fonts.ready);
      const alto = await frame.evaluate(() =>
        Math.min(document.documentElement.scrollHeight, 2400),
      );

      const nombre = `${pantalla}-${tema}-${w}.png`;
      const buf = await p.screenshot({ clip: { x: 0, y: 0, width: w, height: alto } });
      writeFileSync(join(destino, nombre), buf);
      nombres.push(nombre);
    }
    await p.close();
  }
}

if (!contra) {
  await b.close();
  console.log(`${nombres.length} capturas en ${destino}`);
  process.exit(0);
}

/** Cuantos pixeles difieren y en que rectangulo, decodificando en el navegador. */
const comparar = async (pagina, rutaA, rutaB) => {
  const b64 = (f) => "data:image/png;base64," + readFileSync(f).toString("base64");
  return pagina.evaluate(
    async ([ia, ib]) => {
      const carga = (src) =>
        new Promise((ok, mal) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = mal;
          i.src = src;
        });
      const [x, y] = await Promise.all([carga(ia), carga(ib)]);
      if (x.width !== y.width || x.height !== y.height) {
        return { tamano: [x.width, x.height, y.width, y.height] };
      }
      const pixeles = (img) => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const A = pixeles(x);
      const B = pixeles(y);
      let n = 0;
      let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
      for (let i = 0; i < A.length; i += 4) {
        if (A[i] === B[i] && A[i + 1] === B[i + 1] && A[i + 2] === B[i + 2]) continue;
        n += 1;
        const px = (i / 4) % x.width;
        const py = Math.floor(i / 4 / x.width);
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
      return { total: x.width * x.height, distintos: n, caja: n ? [x0, y0, x1, y1] : null };
    },
    [b64(rutaA), b64(rutaB)],
  );
};

const pagina = await b.newPage();
const cambiadas = [];
const ruido = [];

for (const nombre of nombres) {
  const rutaA = join(contra, nombre);
  if (!existsSync(rutaA)) {
    cambiadas.push(`${nombre}: no hay baseline`);
    continue;
  }
  const r = await comparar(pagina, rutaA, join(destino, nombre));
  if (r.tamano) {
    cambiadas.push(`${nombre}: cambio de tamano ${r.tamano.join("x")}`);
    continue;
  }
  if (r.distintos === 0) continue;
  const proporcion = r.distintos / r.total;
  const linea = `${nombre}: ${r.distintos} px (${(proporcion * 100).toFixed(4)}%) en [${r.caja.join(", ")}]`;
  if (proporcion > TOLERANCIA) cambiadas.push(linea);
  else ruido.push(linea);
}

await b.close();

for (const l of ruido) console.log(`  ruido  ${l}`);

if (cambiadas.length === 0) {
  console.log(`Sin cambios visuales en las ${nombres.length} capturas.`);
  process.exit(0);
}
console.error(`\n${cambiadas.length} captura(s) cambiaron de verdad:`);
for (const l of cambiadas) console.error(`  ${l}`);
console.error(`\nMirar: ${contra}/<nombre> contra ${destino}/<nombre>`);
process.exit(1);
