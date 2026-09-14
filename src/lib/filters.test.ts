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
    kind: "consumption", currency: "ARS", card_last4: "5678",
    description: "PVS*COMERCIO UNO",
    account: { id: "visa" }, category: { id: "super" },
  },
  {
    kind: "installment", currency: "ARS", card_last4: "1234",
    description: "COMERCIO DOS",
    account: { id: "visa" }, category: { id: "salud" },
  },
  {
    kind: "consumption", currency: "USD", card_last4: "5678",
    description: "Suscripcion",
    account: { id: "visa" }, category: null,
  },
  {
    kind: "payment", currency: "ARS", card_last4: null,
    description: "SU PAGO EN PESOS",
    account: { id: "master" }, category: { id: "pagos" },
  },
];

test("sin filtros no se filtra nada", () => {
  assert.equal(applyFilters(rows, EMPTY_FILTERS).length, 4);
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
});

test("filtra por cuenta, tipo, moneda y plastico", () => {
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, cuenta: "master" }).length, 1);
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, tipo: "installment" }).length, 1);
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, moneda: "USD" }).length, 1);
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, plastico: "5678" }).length, 2);
});

test("los filtros se combinan", () => {
  const r = applyFilters(rows, { ...EMPTY_FILTERS, cuenta: "visa", moneda: "ARS", plastico: "5678" });
  assert.equal(r.length, 1);
  assert.equal(r[0].description, "PVS*COMERCIO UNO");
});

test("se puede filtrar por lo que no tiene categoria", () => {
  const r = applyFilters(rows, { ...EMPTY_FILTERS, categoria: SIN_CATEGORIA });
  assert.equal(r.length, 1);
  assert.equal(r[0].description, "Suscripcion");
});

test("la busqueda ignora mayusculas, acentos y signos", () => {
  // La descripcion real es "PVS*COMERCIO UNO".
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
