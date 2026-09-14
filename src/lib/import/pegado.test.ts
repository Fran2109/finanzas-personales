import { test } from "node:test";
import assert from "node:assert/strict";

import { parsePastedStatement } from "./pegado.ts";
import { reconcile } from "./reconcile.ts";

// Tabla inventada con la forma real del home banking: cada celda en su propia
// linea, columnas vacias que no dejan rastro, y el total al final.
const PEGADO = `
Fecha
Tarjeta
Descripción
Cuotas
Importe en pesos
Importe en dólares
10/09/2026

Visa 1234

COMERCIO UNO


$ 1.500,50


09/09/2026

Visa 1234

TIENDA EXTRANJERA



USD 20

08/09/2026

Visa 1234

COMERCIO DOS

2 de 6

$ 2.000


07/09/2026


Pago de tu tarjeta


- $ 9.999,99


06/09/2026

Visa 5678

IVA RG 4240


$ 100,25


Total

$ 3.600,75

USD 20
`;

test("lee la tabla pegada y reconcilia", () => {
  const st = parsePastedStatement(PEGADO);
  assert.equal(st.rows.length, 4);
  assert.deepEqual(st.unparsedLines, []);
  assert.equal(st.declaredTotalArs, 360075);
  assert.equal(st.declaredTotalUsd, 2000);
  assert.equal(reconcile(st).ok, true);
});

test("el pago queda afuera del total declarado", () => {
  // Un resumen cerrado declara un saldo y el pago esta adentro; el home
  // banking declara consumos y lo deja afuera. Sumarlo romperia el gate por
  // el monto del pago, que es enorme al lado de cualquier compra.
  const st = parsePastedStatement(PEGADO);
  assert.equal(st.outsideTotal.length, 1);
  assert.equal(st.outsideTotal[0].kind, "payment");
  assert.equal(st.outsideTotal[0].amount, -999999);
  assert.ok(!st.rows.some((r) => r.kind === "payment"));
});

test("un comercio con PAGO adentro no es un pago de tarjeta", () => {
  // Sin limite de palabra, toda compra por Mercado Pago se leia como el pago
  // del resumen y desaparecia del total.
  const st = parsePastedStatement(`
01/09/2026

Visa 1234

MERPAGO*COMERCIO


$ 1.000


Total

$ 1.000
`);
  assert.equal(st.rows.length, 1);
  assert.equal(st.rows[0].kind, "consumption");
  assert.equal(st.outsideTotal.length, 0);
});

test("saca la marca, el plastico y la cuota", () => {
  const st = parsePastedStatement(PEGADO);
  assert.equal(st.brand, "VISA");
  assert.deepEqual(
    st.rows.map((r) => r.cardLast4),
    ["1234", "1234", "1234", "5678"],
  );
  const cuota = st.rows.find((r) => r.cuotaCurrent);
  assert.equal(cuota?.cuotaCurrent, 2);
  assert.equal(cuota?.cuotaTotal, 6);
});

test("un impuesto se reconoce como tal", () => {
  const st = parsePastedStatement(PEGADO);
  assert.equal(st.rows.at(-1)?.kind, "tax_fee");
});

test("montos sin decimales, con miles y en dolares", () => {
  const st = parsePastedStatement(PEGADO);
  assert.equal(st.rows[0].amount, 150050);
  assert.equal(st.rows[0].currency, "ARS");
  assert.equal(st.rows[1].amount, 2000);
  assert.equal(st.rows[1].currency, "USD");
  // "2.000" es dos mil, no dos con cero cero cero.
  assert.equal(st.rows[2].amount, 200000);
});

test("sin la linea Total no hay contra que verificar, y se rechaza", () => {
  const st = parsePastedStatement(`
10/09/2026

Visa 1234

COMERCIO UNO


$ 1.500,50
`);
  assert.equal(st.unparsedLines.length, 1);
  assert.match(st.unparsedLines[0], /Total/);
  assert.equal(reconcile(st).ok, false);
});

test("una fila incompleta se rechaza en vez de perderse", () => {
  // El modo de falla que importa: una fila sin monto se saltea en silencio y
  // el mes queda corto sin que nadie se entere.
  const st = parsePastedStatement(`
10/09/2026

Visa 1234

COMERCIO SIN IMPORTE


09/09/2026

Visa 1234

COMERCIO UNO


$ 1.000


Total

$ 1.000
`);
  assert.equal(st.rows.length, 1);
  assert.equal(st.unparsedLines.length, 1);
  assert.match(st.unparsedLines[0], /COMERCIO SIN IMPORTE/);
  assert.equal(reconcile(st).ok, false);
});

test("una fila con las dos columnas toma la que no esta en cero", () => {
  const st = parsePastedStatement(`
10/09/2026

Visa 1234

TIENDA EXTRANJERA

$ 0,00

USD 15,50


Total

USD 15,50
`);
  assert.equal(st.rows.length, 1);
  assert.equal(st.rows[0].currency, "USD");
  assert.equal(st.rows[0].amount, 1550);
  assert.equal(reconcile(st).ok, true);
});

test("si falta una fila el total no cierra y el gate lo dice", () => {
  const st = parsePastedStatement(`
10/09/2026

Visa 1234

COMERCIO UNO


$ 1.000


Total

$ 2.000
`);
  const check = reconcile(st);
  assert.equal(check.ok, false);
  assert.match(check.problems.join(" "), /no da el total declarado/);
});

test("los links pegados del navegador no ensucian la descripcion", () => {
  const st = parsePastedStatement(`
10/09/2026

Visa 1234

[www.comercio.com](https://www.comercio.com).


$ 1.000


Total

$ 1.000
`);
  assert.equal(st.rows[0].rawDescription, "www.comercio.com.");
});

test("una devolucion del comercio resta sola", () => {
  const st = parsePastedStatement(`
10/09/2026

Visa 1234

COMERCIO UNO


$ 1.000


09/09/2026

Visa 1234

COMERCIO UNO


- $ 400


Total

$ 600
`);
  assert.equal(st.rows.length, 2);
  assert.equal(st.rows[1].kind, "refund");
  assert.equal(st.rows[1].amount, -40000);
  assert.equal(reconcile(st).ok, true);
});

// La otra tabla: el Total arriba de todo, la descripcion antes que la fecha, la
// cuota pegada a la fecha y ninguna columna de plastico. Mismo lector.
const PEGADO_AL_REVES = `
Total
$ 519.327,04
US$ 0,00
Comercio*uno
07/09/2026  Cuota 1/3
$66.166,68
Comercio*dos
01/09/2026  Cuota 1/3
$109.509,62
Comercio*tres
12/08/2026  Cuota 2/3
$14.633,33
Comercio*dos
23/07/2026  Cuota 3/3
$287.015,00
Comercio*dos
11/05/2026  Cuota 5/12
$42.002,41
`;

test("lee la tabla con el Total arriba y la fecha despues de la descripcion", () => {
  const st = parsePastedStatement(PEGADO_AL_REVES);
  assert.equal(st.rows.length, 5);
  assert.deepEqual(st.unparsedLines, []);
  assert.equal(st.declaredTotalArs, 51932704);
  assert.equal(st.declaredTotalUsd, 0);
  assert.equal(reconcile(st).ok, true);
});

test("el Total de arriba no se come el primer movimiento", () => {
  // Los totales se leen hasta la primera linea que no es un monto. Si no
  // cortara ahi, la descripcion del primer movimiento quedaria adentro del
  // encabezado y el movimiento se perderia entero.
  const st = parsePastedStatement(PEGADO_AL_REVES);
  assert.equal(st.rows[0].rawDescription, "Comercio*uno");
  assert.equal(st.rows[0].occurredOn, "2026-09-07");
});

test("la cuota pegada a la fecha se separa igual que en su propia celda", () => {
  const st = parsePastedStatement(PEGADO_AL_REVES);
  assert.deepEqual(
    st.rows.map((r) => `${r.cuotaCurrent}/${r.cuotaTotal}`),
    ["1/3", "1/3", "2/3", "3/3", "5/12"],
  );
  // Y no se cuela en la descripcion.
  assert.ok(!st.rows.some((r) => /cuota/i.test(r.rawDescription)));
});

test("sin columna de plastico no se inventa una marca", () => {
  const st = parsePastedStatement(PEGADO_AL_REVES);
  assert.equal(st.brand, null);
  assert.ok(st.rows.every((r) => r.cardLast4 === null));
});

test("en este orden tambien se nota la fila sin importe", () => {
  // Con la descripcion antes que la fecha, una fila sin importe deja su
  // descripcion huerfana entre dos movimientos y no hay forma de saber a cual
  // de los dos pertenece. Asi que no se reparte: los dos bloques quedan sin
  // leer. Que el reparto sea ambiguo no importa; lo que importa es que nada
  // pase en silencio, y el gate rechaza el pegado entero.
  const st = parsePastedStatement(`
Total

$ 1.000

COMERCIO SIN IMPORTE

09/09/2026

COMERCIO UNO

01/09/2026

$ 1.000
`);
  assert.equal(st.rows.length, 0);
  assert.equal(st.unparsedLines.length, 2);
  assert.match(st.unparsedLines.join(" "), /COMERCIO SIN IMPORTE/);
  assert.equal(reconcile(st).ok, false);
});

test("dos tablas pegadas juntas se rechazan en vez de sumarse", () => {
  // Sumar los dos totales dejaria pasar el pegado repetido por accidente, que
  // duplica el mes entero sin que nada lo note.
  const st = parsePastedStatement(PEGADO_AL_REVES + PEGADO_AL_REVES);
  assert.match(st.unparsedLines.join(" "), /2 lineas 'Total'/);
  assert.equal(reconcile(st).ok, false);
});

test("un movimiento sin fecha no pasa", () => {
  const st = parsePastedStatement(`
Total

$ 1.000

COMERCIO SIN FECHA

$ 1.000
`);
  assert.equal(st.rows.length, 0);
  assert.equal(st.unparsedLines.length, 1);
  assert.equal(reconcile(st).ok, false);
});
