import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmountToCents, centsToNumeric, centsFromDb, formatCents } from "./money.ts";

test("parsea las formas que uno tipea de verdad", () => {
  assert.equal(parseAmountToCents("1234"), 123400);
  assert.equal(parseAmountToCents("1234,56"), 123456);
  assert.equal(parseAmountToCents("1234.56"), 123456);
  assert.equal(parseAmountToCents("1.234,56"), 123456);
  assert.equal(parseAmountToCents("1.234.567,89"), 123456789);
  assert.equal(parseAmountToCents("$ 1.234,56"), 123456);
  assert.equal(parseAmountToCents("  2500  "), 250000);
  assert.equal(parseAmountToCents("-500,25"), -50025);
  assert.equal(parseAmountToCents("0,07"), 7);
  assert.equal(parseAmountToCents(",5"), 50);
});

test("un grupo de 3 digitos es de miles, no decimales", () => {
  assert.equal(parseAmountToCents("1.234"), 123400);
  assert.equal(parseAmountToCents("1.234.567"), 123456700);
  // La regla no mira cual de los dos separadores es: con 2 decimales en la base
  // un grupo de 3 nunca puede ser la parte decimal.
  assert.equal(parseAmountToCents("1,234"), 123400);
});

test("rechaza lo invalido en vez de adivinar", () => {
  assert.equal(parseAmountToCents(""), null);
  assert.equal(parseAmountToCents("abc"), null);
  assert.equal(parseAmountToCents("12,3456"), null);
  assert.equal(parseAmountToCents("1.2.3,45,6"), null);
});

test("a numeric(18,2) va por aritmetica entera, sin float", () => {
  assert.equal(centsToNumeric(123456), "1234.56");
  assert.equal(centsToNumeric(7), "0.07");
  assert.equal(centsToNumeric(0), "0.00");
  assert.equal(centsToNumeric(-50025), "-500.25");
  assert.equal(centsToNumeric(231133270), "2311332.70");
});

test("el total del resumen de agosto sobrevive la ida y vuelta", () => {
  // 2.311.332,70 ARS es el total declarado del fixture Galicia de agosto/26.
  const cents = parseAmountToCents("2.311.332,70");
  assert.equal(cents, 231133270);
  assert.equal(centsToNumeric(cents!), "2311332.70");
  // Y el mismo numero volviendo de PostgREST como float de JSON.
  assert.equal(centsFromDb(2311332.7), 231133270);
  assert.equal(centsFromDb(31.71), 3171);
});

test("formatea en es-AR", () => {
  assert.match(formatCents(231133270, "ARS"), /2\.311\.332,70/);
  assert.match(formatCents(3171, "USD"), /31,71/);
});
