import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSupervielleStatement } from "./supervielle.ts";
import { reconcile } from "./reconcile.ts";
import { detectBank } from "./detect.ts";

/**
 * Resumen inventado con el formato real de Supervielle, incluido el defecto de
 * extraccion que mete un espacio despues de cada "S".
 *
 * ARS 1.000,00 - 1.000,00 + 500,00 + 250,00 + 40,00 = 790,00
 */
const RESUMEN = `
NRO DE CUENTA : 1234567890
FECHA CIERRE ACTUAL : 2026-08-27
TARJETA 1234 Total Consumos de NOMBRE APELLIDO 750,00 0,00
VIS A : GENERAL
S UCURS AL : 257 - LOCALIDAD
TNA TNA USD TEM TEM USD
79,460% 0,000% 6,531% 0,000%
FECHA DETALLE DE TRANSACCION IMPORTE EN PESOS IMPORTE EN DOLARES
SALDO ANTERIOR 1.000,00 0,00
2026-08-06 S U PAGO EN PES OS -1.000,00 0,00
Movimientos
FECHA COMPROBANTE DETALLE DE TRANSACCION IMPORTE EN PESOS IMPORTE EN DOLARES
2026-05-11 238533 COMERCIO UNO C.04/12 500,00
2026-08-12 323731 COMERCIO DOS 01/03 250,00
FECHA DETALLE DE TRANSACCION IMPORTE EN PESOS IMPORTE EN DOLARES
2026-08-27 IMPUES TO DE S ELLOS $ 40,00 0,00
SALDO ACTUAL 790,00 0,00
PAGO MINIMO 200,00 0,00
Cuotas a vencer
Setiembre/26 $500,00
Costo Financ iero Total de Tasa Efec tiva Anual (CFT TEA) 152,29 %
`;

test("reconoce el banco por la estructura", () => {
  assert.equal(detectBank(RESUMEN), "supervielle");
});

test("lee la cabecera", () => {
  const st = parseSupervielleStatement(RESUMEN);
  assert.equal(st.brand, "SUPERVIELLE VISA");
  assert.equal(st.statementId, "1234567890");
  assert.equal(st.periodClose, "2026-08-27");
  assert.equal(st.previousBalanceArs, 100000);
  assert.equal(st.declaredTotalArs, 79000);
});

test("repara el espacio que el PDF mete despues de cada S", () => {
  const st = parseSupervielleStatement(RESUMEN);
  const descripciones = st.rows.map((r) => r.rawDescription);
  assert.ok(descripciones.includes("SU PAGO EN PESOS"), descripciones.join(" | "));
  assert.ok(descripciones.includes("IMPUESTO DE SELLOS"), descripciones.join(" | "));
});

test("el comprobante va adelante y no se cuela en la descripcion", () => {
  const st = parseSupervielleStatement(RESUMEN);
  const uno = st.rows.find((r) => r.rawDescription === "COMERCIO UNO")!;
  assert.equal(uno.amount, 50000);
  assert.equal(uno.cuotaCurrent, 4);
  assert.equal(uno.cuotaTotal, 12);
});

test("lee las dos formas de marcar la cuota", () => {
  const st = parseSupervielleStatement(RESUMEN);
  // "C.04/12" en VISA y "01/03" en MASTERCARD.
  assert.equal(st.rows.find((r) => r.rawDescription === "COMERCIO DOS")!.cuotaCurrent, 1);
});

test("con las dos columnas, el monto no es el ultimo de la linea", () => {
  // La fila trae pesos y dolares; tomar el ultimo monto daria 0,00 siempre.
  const st = parseSupervielleStatement(RESUMEN);
  const sellos = st.rows.find((r) => r.rawDescription === "IMPUESTO DE SELLOS")!;
  assert.equal(sellos.amount, 4000);
  assert.equal(sellos.currency, "ARS");
});

test("el pago no se rastrea", () => {
  const st = parseSupervielleStatement(RESUMEN);
  assert.equal(st.rows.find((r) => r.rawDescription === "SU PAGO EN PESOS")!.tracked, false);
  assert.equal(st.rows.find((r) => r.rawDescription === "COMERCIO UNO")!.tracked, true);
});

test("la letra chica no entra como movimiento", () => {
  // El reverso esta lleno de porcentajes con coma que parecen montos.
  const st = parseSupervielleStatement(RESUMEN);
  assert.equal(st.rows.length, 4);
  assert.doesNotMatch(st.rows.map((r) => r.rawDescription).join(" "), /CFT|Costo Financ/i);
});

test("el gate pasa y cruza el subtotal del plastico", () => {
  const rec = reconcile(parseSupervielleStatement(RESUMEN));
  assert.equal(rec.ok, true, rec.problems.join(" / "));
  assert.equal(rec.cards.every((c) => c.ok), true);
});

test("el gate rechaza si se pierde una fila", () => {
  const mutilado = RESUMEN.replace("2026-08-12 323731 COMERCIO DOS 01/03 250,00\n", "");
  assert.equal(reconcile(parseSupervielleStatement(mutilado)).ok, false);
});
