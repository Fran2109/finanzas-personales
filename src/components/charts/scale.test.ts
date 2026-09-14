import { test } from "node:test";
import assert from "node:assert/strict";

import { axisMax, barPath, columnPath, niceStep, niceTicks } from "./scale.ts";

test("el paso del eje es un numero que se pueda leer", () => {
  // Lo que se quiere evitar: un eje que diga 833.333.
  assert.equal(niceStep(2_500_000, 3), 1_000_000);
  assert.equal(niceStep(1_000_000, 3), 500_000);
  // 250 no sirve: tres marcas llegarian a 750 y no cubren 900.
  assert.equal(niceStep(900, 3), 500);
  assert.equal(niceStep(30, 3), 10);
  for (const max of [7, 42, 199, 1234, 98765, 4_510_210]) {
    const step = niceStep(max, 3);
    const mantisa = step / Math.pow(10, Math.floor(Math.log10(step)));
    assert.ok([1, 2, 2.5, 5, 10].includes(Number(mantisa.toFixed(4))), `paso feo: ${step}`);
  }
});

test("el tope del eje siempre cubre el maximo", () => {
  // Si no, la barra mas alta se sale de la grilla.
  for (const max of [1, 7, 99, 100, 101, 1_002_524, 4_510_210]) {
    assert.ok(axisMax(max) >= max, `${axisMax(max)} < ${max}`);
  }
});

test("las marcas arrancan en cero y van parejas", () => {
  const ticks = niceTicks(1_000_000, 3);
  assert.equal(ticks[0], 0);
  const pasos = ticks.slice(1).map((t, i) => t - ticks[i]);
  assert.ok(pasos.every((p) => Math.abs(p - pasos[0]) < 1e-9), "pasos desparejos");
});

test("un maximo en cero o invalido no rompe la escala", () => {
  // Un mes sin nada no tiene que dividir por cero ni dibujar NaN.
  assert.deepEqual(niceTicks(0), [0]);
  assert.deepEqual(niceTicks(-5), [0]);
  assert.equal(axisMax(0), 1);
  assert.ok(Number.isFinite(niceStep(Number.NaN)));
});

test("la columna se ancla a la base y se redondea arriba", () => {
  const d = columnPath(10, 20, 24, 80);
  // Arranca y termina en la base (20+80), que es la linea del cero.
  assert.ok(d.startsWith("M10,100"), d);
  assert.ok(d.includes("Q"), "sin curva no hay punta redondeada");
  assert.ok(d.endsWith("Z"));
});

test("una barra sin alto o sin largo no dibuja nada", () => {
  assert.equal(columnPath(0, 0, 24, 0), "");
  assert.equal(barPath(0, 0, 0, 24), "");
});

test("el radio nunca deforma una barra mas chica que el radio", () => {
  // Con 2px de alto, un radio de 4 daria una curva que se come la barra.
  const d = columnPath(0, 0, 24, 2);
  assert.ok(!d.includes("NaN"));
  assert.ok(d.includes("Q0,0"), d);
});
