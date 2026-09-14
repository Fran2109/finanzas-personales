import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFilters,
  EMPTY_FILTERS,
  hasActiveFilters,
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
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, cuenta: "master" }).length, 1);
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, tipo: "installment" }).length, 1);
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, moneda: "USD" }).length, 1);
});

test("los filtros se combinan", () => {
  const r = applyFilters(rows, { ...EMPTY_FILTERS, cuenta: "visa", moneda: "ARS", tipo: "consumption" });
  assert.equal(r.length, 1);
  assert.equal(r[0].description, "PVS*COMERCIO UNO");
});

test("se puede filtrar por lo que no tiene categoria", () => {
  const r = applyFilters(rows, { ...EMPTY_FILTERS, categoria: SIN_CATEGORIA });
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

test("lee los filtros de la URL e ignora lo que no conoce", () => {
  const f = readFilters({ cuenta: "visa", q: "  cafe  ", otro: "x" });
  assert.equal(f.cuenta, "visa");
  assert.equal(f.q, "cafe");
  assert.equal(f.tipo, "");
  assert.equal(hasActiveFilters(f), true);
});
