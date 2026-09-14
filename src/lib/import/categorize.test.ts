import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestCategory, suggestPattern, type Rule } from "./categorize.ts";
import type { ParsedRow } from "./types.ts";

function fila(rawDescription: string, extra: Partial<ParsedRow> = {}): ParsedRow {
  return {
    lineNo: 1,
    occurredOn: "2026-07-02",
    rawDescription,
    amount: 10000,
    currency: "ARS",
    kind: "consumption",
    tracked: true,
    cardLast4: null,
    cuotaCurrent: null,
    cuotaTotal: null,
    ...extra,
  };
}

test("el patron descarta la cola que cambia todos los meses", () => {
  // Si el patron se quedara con el numero de operacion, la regla no volveria a
  // matchear nunca.
  assert.equal(suggestPattern("COMERCIO EJEMPLO 004401728909-044-000"), "COMERCIO EJEMPLO");
  assert.equal(suggestPattern("TIENDA*SUCURSAL 12345"), "TIENDA SUCURSAL");
});

test("las cuotas de una misma compra dan el mismo patron", () => {
  // El numero de cuota viaja en la descripcion de los planes consolidados, y
  // cambia mes a mes: el patron tiene que ignorarlo o la regla aprendida en un
  // resumen no sirve para el siguiente.
  const uno = suggestPattern("PLAN V CONSOLID 4-12 (TNA 37,00)");
  const dos = suggestPattern("PLAN V CONSOLID 5-12 (TNA 37,00)");
  assert.equal(uno, dos);
});

test("una regla aprendida de una cuota matchea la cuota siguiente", () => {
  // Este es el caso que fallaba: la cuota 2/3 se categorizaba en un resumen y
  // la 1/3 del resumen anterior volvia a pedir categoria.
  const rules: Rule[] = [{ id: "r1", pattern: "COMERCIO DOS", category_id: "lentes" }];
  const cuotaSiguiente = fila("COMERCIO DOS", { kind: "installment", cuotaCurrent: 1 });
  assert.equal(suggestCategory(cuotaSiguiente, rules), "lentes");
});

test("la regla mas especifica le gana a la generica", () => {
  const rules: Rule[] = [
    { id: "r1", pattern: "TIENDA", category_id: "generica" },
    { id: "r2", pattern: "TIENDA ESPECIFICA", category_id: "especifica" },
  ];
  assert.equal(suggestCategory(fila("TIENDA ESPECIFICA SUCURSAL"), rules), "especifica");
  assert.equal(suggestCategory(fila("TIENDA OTRA COSA"), rules), "generica");
});

test("un comercio desconocido no se adivina", () => {
  const rules: Rule[] = [{ id: "r1", pattern: "TIENDA", category_id: "generica" }];
  assert.equal(suggestCategory(fila("COMERCIO NUEVO"), rules), null);
});

test("el match ignora mayusculas, acentos y signos", () => {
  const rules: Rule[] = [{ id: "r1", pattern: "comercio uno", category_id: "comida" }];
  assert.equal(suggestCategory(fila("PVS*COMERCIO UNO"), rules), "comida");
});
