import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGaliciaVisa } from "./galicia-visa.ts";
import { reconcile } from "./reconcile.ts";

/**
 * Resumen inventado, con el formato real pero sin datos de nadie.
 *
 * Cierra a proposito:
 *   ARS  1.000,00 - 1.000,00 + 1.500,00 + 500,50 - 200,00 + 21,00 + 2,00 = 1.823,50
 *   USD     10,00 -    10,00 +     7,00                                  =     7,00
 */
const RESUMEN = `
Resumen N° VI00000000000000001
20260820000000001H
CONSOLIDADO PESOS DÓLARES
SALDO ANTERIOR 1.000,00 10,00
03-08-26 SU PAGO EN PESOS -1.000,00
03-08-26 SU PAGO EN USD -10,00
DETALLE DEL CONSUMO
FECHA REFERENCIA CUOTA COMPROBANTE PESOS DÓLARES
01-08-26 * COMERCIO UNO 000111 1.500,00
02-08-26 * COMERCIO DOS 02/06 000222 500,50
03-08-26 F SERVICIO EXTERIOR USD 7,00 000333 7,00
04-08-26 * COMERCIO TRES 000444 -200,00
TARJETA 1234 Total Consumos de NOMBRE APELLIDO 1.800,50 7,00
20-08-26 IVA RG 4240 21%( 100,00) 21,00
20-08-26 IIBB PERCEP-CABA 2,00%( 100,00) 2,00
TOTAL A PAGAR 1.823,50 7,00
`;

test("lee la cabecera del resumen", () => {
  const st = parseGaliciaVisa(RESUMEN);
  assert.equal(st.statementId, "VI00000000000000001");
  assert.equal(st.periodClose, "2026-08-20");
  assert.equal(st.previousBalanceArs, 100000);
  assert.equal(st.previousBalanceUsd, 1000);
  assert.equal(st.declaredTotalArs, 182350);
  assert.equal(st.declaredTotalUsd, 700);
});

test("transcribe todas las filas sin dejar ninguna sin leer", () => {
  const st = parseGaliciaVisa(RESUMEN);
  assert.equal(st.rows.length, 8);
  assert.deepEqual(st.unparsedLines, []);
});

test("separa lo que no es consumo", () => {
  const st = parseGaliciaVisa(RESUMEN);
  const kinds = st.rows.map((r) => r.kind);
  assert.equal(kinds.filter((k) => k === "payment").length, 2);
  assert.equal(kinds.filter((k) => k === "tax_fee").length, 2);
  assert.equal(kinds.filter((k) => k === "consumption").length, 3);
  // Un negativo dentro del detalle de consumo es una devolucion.
  assert.equal(kinds.filter((k) => k === "refund").length, 1);
});

test("el monto en dolares no se confunde con el de pesos", () => {
  const st = parseGaliciaVisa(RESUMEN);
  const usd = st.rows.filter((r) => r.currency === "USD");
  assert.equal(usd.length, 2);
  const consumo = usd.find((r) => r.kind === "consumption")!;
  assert.equal(consumo.amount, 700);
  assert.equal(consumo.rawDescription, "SERVICIO EXTERIOR");
});

test("detecta cuotas", () => {
  const st = parseGaliciaVisa(RESUMEN);
  const cuota = st.rows.find((r) => r.cuotaCurrent !== null)!;
  assert.equal(cuota.rawDescription, "COMERCIO DOS");
  assert.equal(cuota.cuotaCurrent, 2);
  assert.equal(cuota.cuotaTotal, 6);
});

test("imputa cada consumo a su plastico, y el bloque consolidado a ninguno", () => {
  const st = parseGaliciaVisa(RESUMEN);
  const conTarjeta = st.rows.filter((r) => r.cardLast4 === "1234");
  assert.equal(conTarjeta.length, 4);
  // Pagos e impuestos son del resumen, no de una tarjeta.
  for (const r of st.rows.filter((x) => x.kind === "payment" || x.kind === "tax_fee")) {
    assert.equal(r.cardLast4, null);
  }
});

test("el gate pasa cuando el resumen cierra al centavo", () => {
  const rec = reconcile(parseGaliciaVisa(RESUMEN));
  assert.equal(rec.ok, true);
  assert.deepEqual(rec.problems, []);
  assert.equal(rec.currencies.every((c) => c.difference === 0), true);
  assert.equal(rec.cards.every((c) => c.ok), true);
});

test("el gate rechaza si se pierde una fila", () => {
  // Una linea salteada es el modo de falla que este gate existe para atrapar.
  const mutilado = RESUMEN.replace("01-08-26 * COMERCIO UNO 000111 1.500,00\n", "");
  const rec = reconcile(parseGaliciaVisa(mutilado));
  assert.equal(rec.ok, false);
  assert.match(rec.problems.join(" "), /ARS/);
  assert.equal(rec.currencies.find((c) => c.currency === "ARS")!.difference, -150000);
});

test("el gate rechaza si un monto se lee mal", () => {
  const alterado = RESUMEN.replace("000111 1.500,00", "000111 1.500,10");
  const rec = reconcile(parseGaliciaVisa(alterado));
  assert.equal(rec.ok, false);
});

test("el gate rechaza un PDF que no es un resumen", () => {
  const rec = reconcile(parseGaliciaVisa("una factura de luz cualquiera"));
  assert.equal(rec.ok, false);
  assert.match(rec.problems.join(" "), /ningun movimiento/);
});

test("las refinanciaciones son servicio de deuda, no compras", () => {
  const conPlan = RESUMEN.replace(
    "01-08-26 * COMERCIO UNO 000111 1.500,00",
    "02-01-26 PLAN V CONSOLID 5-12 (TNA 37,00) 000111 1.500,00",
  );
  const st = parseGaliciaVisa(conPlan);
  const plan = st.rows.find((r) => r.kind === "financing")!;
  assert.equal(plan.cuotaCurrent, 5);
  assert.equal(plan.cuotaTotal, 12);
  assert.equal(reconcile(st).ok, true);
});
