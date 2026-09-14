import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceSign,
  CATEGORY_KIND_FOR,
  isExpenseKind,
  toExpenseKind,
  isKind,
  KINDS,
  KIND_LABELS,
  MANUAL_KINDS,
  normalizeAmountForKind,
  periodOfDate,
  EXPENSE_KINDS,
} from "./domain.ts";

test("cada kind tiene etiqueta y familia de categoria", () => {
  for (const kind of KINDS) {
    assert.ok(KIND_LABELS[kind], `falta etiqueta para ${kind}`);
    assert.ok(CATEGORY_KIND_FOR[kind], `falta familia para ${kind}`);
  }
});

test("los dos tipos comparten las categorias de gasto", () => {
  // Si la cuota tuviera familia propia, una compra financiada dejaria de decir
  // en que se fue la plata.
  assert.equal(CATEGORY_KIND_FOR.consumption, "expense");
  assert.equal(CATEGORY_KIND_FOR.installment, "expense");
});

test("una cuota es un gasto como cualquier otro", () => {
  assert.ok(EXPENSE_KINDS.includes("installment"));
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

test("la app registra dos tipos de gasto y nada mas", () => {
  assert.deepEqual([...EXPENSE_KINDS], ["consumption", "installment"]);
  assert.deepEqual([...MANUAL_KINDS], ["consumption", "installment"]);
});

test("lo que no es cuota se pasa como gasto", () => {
  // Impuestos, percepciones e intereses son plata que salio: son gastos. Una
  // devolucion tambien, con monto negativo.
  for (const kind of ["consumption", "tax_fee", "financing", "refund"] as const) {
    assert.equal(toExpenseKind(kind, null), "consumption", kind);
  }
});

test("lo que tiene marca de cuota se pasa como cuota", () => {
  // Incluye las refinanciaciones: "PLAN V CONSOLID 5-12" es la cuota 5 de 12.
  assert.equal(toExpenseKind("consumption", 2), "installment");
  assert.equal(toExpenseKind("financing", 5), "installment");
  assert.equal(toExpenseKind("installment", 1), "installment");
});

test("lo que no es un gasto no se importa", () => {
  for (const kind of ["payment", "transfer", "income"] as const) {
    assert.equal(toExpenseKind(kind, null), null, kind);
    assert.equal(isExpenseKind(kind), false, kind);
    assert.equal(MANUAL_KINDS.includes(kind), false, kind);
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

test("el periodo del resumen sale de su fecha de cierre", () => {
  // El resumen que cierra el 20 de agosto es el de agosto, aunque venza en
  // septiembre y traiga compras de junio.
  assert.equal(periodOfDate("2026-08-20"), "2026-08");
  assert.equal(periodOfDate("2026-01-02"), "2026-01");
  assert.equal(periodOfDate("no es una fecha"), null);
  assert.equal(periodOfDate(""), null);
});

test("todo lo que la app registra es un gasto", () => {
  for (const kind of EXPENSE_KINDS) {
    assert.equal(isExpenseKind(kind), true);
    assert.ok(CATEGORY_KIND_FOR[kind], `${kind} necesita familia de categoria`);
  }
});
