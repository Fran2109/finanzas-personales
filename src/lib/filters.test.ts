import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFilters,
  CON_NOTA,
  EMPTY_FILTERS,
  hasActiveFilters,
  monthQuery,
  readFilters,
  SIN_CATEGORIA,
  SIN_NOTA,
  type Filterable,
} from "./filters.ts";

const rows: Filterable[] = [
  {
    kind: "consumption", currency: "ARS",
    description: "PVS*COMERCIO UNO",
    nota: "compra semanal",
    account: { id: "visa" }, category: { id: "super" },
  },
  {
    kind: "installment", currency: "ARS",
    description: "COMERCIO DOS",
    nota: null,
    account: { id: "visa" }, category: { id: "salud" },
  },
  {
    kind: "consumption", currency: "USD",
    description: "Suscripci\u00f3n mensual",
    // De puros espacios: para la app es no tener nota, y el filtro tiene que
    // verla igual que un `null`.
    nota: "   ",
    account: { id: "visa" }, category: null,
  },
  {
    kind: "payment", currency: "ARS",
    description: "SU PAGO EN PESOS",
    nota: null,
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

test("se puede filtrar por tener o no tener nota", () => {
  const con = applyFilters(rows, { ...EMPTY_FILTERS, nota: [CON_NOTA] });
  assert.deepEqual(
    con.map((r) => r.description),
    ["PVS*COMERCIO UNO"],
  );

  // Los tres restantes: dos con `null` y el de puros espacios, que cuenta como
  // sin nota. Si contara como "con", la lista de lo que falta anotar mentiria.
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, nota: [SIN_NOTA] }).length, 3);
});

test("pedir las dos notas es lo mismo que no pedir ninguna", () => {
  assert.equal(
    applyFilters(rows, { ...EMPTY_FILTERS, nota: [CON_NOTA, SIN_NOTA] }).length,
    4,
  );
  assert.equal(applyFilters(rows, { ...EMPTY_FILTERS, nota: [] }).length, 4);
});

test("el filtro de nota viaja en la URL y cuenta como filtro activo", () => {
  assert.deepEqual(readFilters({ nota: "sin" }).nota, [SIN_NOTA]);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, nota: [SIN_NOTA] }), true);
  assert.equal(
    monthQuery("2026-09", { ...EMPTY_FILTERS, nota: [SIN_NOTA] }),
    "mes=2026-09&nota=sin",
  );
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
