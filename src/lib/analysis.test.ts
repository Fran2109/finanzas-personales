import { test } from "node:test";
import assert from "node:assert/strict";

import { categoryDeltas, isProvisional, periodsOf, type PeriodRow } from "./analysis.ts";

function fila(over: Partial<PeriodRow> = {}): PeriodRow {
  return {
    period: "2026-09",
    amount: 100000,
    currency: "ARS",
    categoryName: "Comida",
    isProjected: false,
    ...over,
  };
}

test("compara dos meses por categoria y ordena por lo que mas se movio", () => {
  const deltas = categoryDeltas(
    [
      fila({ period: "2026-08", categoryName: "Comida", amount: 100000 }),
      fila({ period: "2026-09", categoryName: "Comida", amount: 130000 }),
      fila({ period: "2026-08", categoryName: "Nafta", amount: 500000 }),
      fila({ period: "2026-09", categoryName: "Nafta", amount: 100000 }),
    ],
    "2026-08",
    "2026-09",
  );
  assert.equal(deltas[0].label, "Nafta");
  assert.equal(deltas[0].delta, -400000);
  assert.equal(deltas[1].label, "Comida");
  assert.equal(deltas[1].delta, 30000);
});

test("una categoria que aparece o desaparece es un cambio, no un hueco", () => {
  // Es el cambio mas grande que puede haber y filtrarlo seria esconderlo.
  const deltas = categoryDeltas(
    [
      fila({ period: "2026-09", categoryName: "Regalo", amount: 424988 }),
      fila({ period: "2026-08", categoryName: "Impuestos", amount: 51693 }),
    ],
    "2026-08",
    "2026-09",
  );
  const regalo = deltas.find((d) => d.label === "Regalo")!;
  assert.equal(regalo.before, 0);
  assert.equal(regalo.delta, 424988);

  const impuestos = deltas.find((d) => d.label === "Impuestos")!;
  assert.equal(impuestos.after, 0);
  assert.equal(impuestos.delta, -51693);
});

test("una categoria que no se movio no ensucia la lista", () => {
  const deltas = categoryDeltas(
    [
      fila({ period: "2026-08", amount: 100000 }),
      fila({ period: "2026-09", amount: 100000 }),
    ],
    "2026-08",
    "2026-09",
  );
  assert.deepEqual(deltas, []);
});

test("las monedas no se mezclan", () => {
  // Sin cotizaciones cargadas, sumar pesos con dolares seria inventar.
  const rows = [
    fila({ period: "2026-08", amount: 100000, currency: "ARS" }),
    fila({ period: "2026-09", amount: 2000, currency: "USD" }),
  ];
  assert.equal(categoryDeltas(rows, "2026-08", "2026-09", "ARS")[0].delta, -100000);
  assert.equal(categoryDeltas(rows, "2026-08", "2026-09", "USD")[0].delta, 2000);
});

test("los meses de por medio no cuentan", () => {
  const deltas = categoryDeltas(
    [
      fila({ period: "2026-07", amount: 999999 }),
      fila({ period: "2026-08", amount: 100000 }),
      fila({ period: "2026-09", amount: 130000 }),
    ],
    "2026-08",
    "2026-09",
  );
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].delta, 30000);
});

test("los periodos vienen del mas nuevo al mas viejo", () => {
  const rows = [fila({ period: "2026-07" }), fila({ period: "2026-09" }), fila({ period: "2026-08" })];
  assert.deepEqual(periodsOf(rows), ["2026-09", "2026-08", "2026-07"]);
});

test("un mes con provisorios se marca como que todavia puede cambiar", () => {
  const rows = [
    fila({ period: "2026-09", isProjected: true }),
    fila({ period: "2026-08", isProjected: false }),
  ];
  assert.equal(isProvisional(rows, "2026-09"), true);
  assert.equal(isProvisional(rows, "2026-08"), false);
});
