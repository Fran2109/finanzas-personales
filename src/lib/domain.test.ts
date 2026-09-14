import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceSign,
  CATEGORY_KIND_FOR,
  isKind,
  KINDS,
  KIND_LABELS,
  MANUAL_KINDS,
  normalizeAmountForKind,
  SPENDING_KINDS,
} from "./domain.ts";

test("cada kind tiene etiqueta y familia de categoria", () => {
  for (const kind of KINDS) {
    assert.ok(KIND_LABELS[kind], `falta etiqueta para ${kind}`);
    assert.ok(CATEGORY_KIND_FOR[kind], `falta familia para ${kind}`);
  }
});

test("una cuota usa categorias de gasto, no una familia propia", () => {
  // Si tuviera su propia familia, una compra en cuotas dejaria de decir en que
  // se fue la plata: el tipo marca que es financiada, la categoria que se compro.
  assert.equal(CATEGORY_KIND_FOR.installment, "expense");
  assert.equal(CATEGORY_KIND_FOR.consumption, "expense");
});

test("una cuota es consumo a los efectos del reporte", () => {
  assert.ok(SPENDING_KINDS.includes("installment"));
  assert.ok(MANUAL_KINDS.includes("installment"));
  assert.ok(isKind("installment"));
});

test("una cuota baja el saldo como cualquier compra", () => {
  assert.equal(balanceSign("installment", false), -1);
  assert.equal(balanceSign("installment", true), -1);
});

test("el pago de tarjeta es el unico que depende de la cuenta", () => {
  // Sale del banco y cancela deuda de la tarjeta: una sola operacion, dos patas.
  assert.equal(balanceSign("payment", false), -1);
  assert.equal(balanceSign("payment", true), 1);
});

test("lo que no es consumo queda fuera del reporte de gasto", () => {
  for (const kind of ["payment", "tax_fee", "financing", "transfer", "income"] as const) {
    assert.equal(SPENDING_KINDS.includes(kind), false, `${kind} no deberia contar`);
  }
});

test("los pagos y devoluciones se guardan en magnitud", () => {
  // El resumen los imprime en negativo; si se guardaran asi, balanceSign los
  // invertiria de nuevo y un pago de tarjeta sumaria deuda en vez de cancelarla.
  assert.equal(normalizeAmountForKind(-203653390, "payment"), 203653390);
  assert.equal(normalizeAmountForKind(-899139, "refund"), 899139);
  assert.equal(normalizeAmountForKind(-5000, "income"), 5000);
});

test("los kinds de salida conservan el signo: un negativo es una reversion", () => {
  // Una devolucion de percepcion llega en negativo y tiene que seguir asi:
  // balanceSign vale -1, y -1 * negativo devuelve plata, que es lo correcto.
  assert.equal(normalizeAmountForKind(-1017931, "tax_fee"), -1017931);
  assert.equal(normalizeAmountForKind(-899139, "consumption"), -899139);
  assert.equal(normalizeAmountForKind(12598_00, "consumption"), 1259800);
});

test("un pago de tarjeta cancela deuda, no la aumenta", () => {
  const guardado = normalizeAmountForKind(-203653390, "payment");
  // Tarjeta: saldo negativo es deuda, asi que el pago tiene que sumar.
  assert.equal(balanceSign("payment", true) * guardado, 203653390);
  // Banco: la misma operacion saca la plata de la cuenta.
  assert.equal(balanceSign("payment", false) * guardado, -203653390);
});

test("una devolucion de percepcion baja la deuda de la tarjeta", () => {
  const guardado = normalizeAmountForKind(-1017931, "tax_fee");
  assert.equal(balanceSign("tax_fee", true) * guardado, 1017931);
});
