import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFilters,
  EMPTY_FILTERS,
  hasActiveFilters,
  monthQuery,
  readFilters,
  SIN_CATEGORIA,
  type Filterable,
} from "./filters.ts";

const rows: Filterable[] = [
  {
    kind: "consumption", currency: "ARS",
    description: "PVS*COMERCIO UNO",
    account: { id: "visa" }, category: { id: "super" },
  },
  {
    kind: "installment", currency: "ARS",
    description: "COMERCIO DOS",
    account: { id: "visa" }, category: { id: "salud" },
  },
  {
    kind: "consumption", currency: "USD",
    description: "Suscripci\u00f3n mensual",
    account: { id: "visa" }, category: null,
  },
  {
    kind: "payment", currency: "ARS",
    description: "SU PAGO EN PESOS",
    account: { id: "master" }, category: { id: "pagos" },
  },
];

test("sin filtros no se filtra nada", () => {
  assert.equal(applyFilters(rows, EMPTY_FILTERS).length, 4);
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
});

test("filtra por cuenta, tipo y moneda", () => {
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, cuenta: ["master"] }).length, 1);
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, tipo: ["installment"] }).length, 1);
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, moneda: ["USD"] }).length, 1);
});

test("varios valores del mismo filtro suman en vez de restar", () => {
  // "cuenta A o cuenta B" es una pregunta normal, y con un valor solo habia que
  // mirar cada una por separado y sumar a mano.
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, cuenta: ["visa", "master"] }).length, 4);
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, moneda: ["ARS", "USD"] }).length, 4);
  assert.equal(
    applyFilters(rows, { ...EMPTY_FILTERS, tipo: ["consumption", "installment"] }).length,
    3,
  );
});

test("filtros distintos se cruzan aunque cada uno tenga varios valores", () => {
  // Dentro de un filtro es "o"; entre filtros es "y".
  const r = applyFilters(rows, {
    ...EMPTY_FILTERS,
    cuenta: ["visa", "master"],
    moneda: ["ARS"],
    tipo: ["consumption"],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].description, "PVS*COMERCIO UNO");
});

test("una lista vacia no filtra nada", () => {
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, cuenta: [] }).length, 4);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, cuenta: [] }), false);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, cuenta: ["visa"] }), true);
});

test("se puede filtrar por lo que no tiene categoria", () => {
  const r = applyFilters(rows, { ...EMPTY_FILTERS, categoria: [SIN_CATEGORIA] });
  assert.equal(r.length, 1);
  assert.equal(r[0].description, "Suscripci\u00f3n mensual");
});

test("la busqueda ignora mayusculas, acentos y signos", () => {
  // Los resumenes escriben el comercio pegado a un prefijo de procesador y en
  // mayusculas; uno lo busca como lo diria.
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, q: "comercio uno" }).length, 1);
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, q: "suscripcion" }).length, 1);
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, q: "nada de nada" }).length, 0);
});

test("se puede pedir una categoria o ninguna a la vez", () => {
  const r = applyFilters(rows, { ...EMPTY_FILTERS, categoria: ["super", SIN_CATEGORIA] });
  assert.equal(r.length, 2);
});

test("lee los filtros de la URL e ignora lo que no conoce", () => {
  const f = readFilters({ cuenta: "visa,master", q: "  cafe  ", otro: "x" });
  assert.deepEqual(f.cuenta, ["visa", "master"]);
  assert.equal(f.q, "cafe");
  assert.deepEqual(f.tipo, []);
  assert.equal(hasActiveFilters(f), true);
});

test("la URL la escribe cualquiera, asi que se limpia lo vacio y lo repetido", () => {
  const f = readFilters({ cuenta: " visa , , visa ,master,", tipo: "," });
  assert.deepEqual(f.cuenta, ["visa", "master"]);
  assert.deepEqual(f.tipo, []);
});

test("la URL y la lectura son la misma cosa ida y vuelta", () => {
  const f = { ...EMPTY_FILTERS, cuenta: ["visa", "master"], moneda: ["ARS"], q: "cafe" };
  const params = Object.fromEntries(new URLSearchParams(monthQuery("2026-09", f)));
  assert.equal(params.mes, "2026-09");
  assert.deepEqual(readFilters(params), f);
});

test("un filtro vacio no ensucia la URL", () => {
  assert.equal(monthQuery("2026-09", EMPTY_FILTERS), "mes=2026-09");
});
