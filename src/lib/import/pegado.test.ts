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
