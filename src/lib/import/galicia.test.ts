import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGaliciaStatement } from "./galicia.ts";
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
  const st = parseGaliciaStatement(RESUMEN);
  assert.equal(st.statementId, "VI00000000000000001");
  assert.equal(st.periodClose, "2026-08-20");
  assert.equal(st.previousBalanceArs, 100000);
  assert.equal(st.previousBalanceUsd, 1000);
  assert.equal(st.declaredTotalArs, 182350);
  assert.equal(st.declaredTotalUsd, 700);
});

test("transcribe todas las filas sin dejar ninguna sin leer", () => {
  const st = parseGaliciaStatement(RESUMEN);
  assert.equal(st.rows.length, 8);
  assert.deepEqual(st.unparsedLines, []);
});

test("separa lo que no es consumo", () => {
  const st = parseGaliciaStatement(RESUMEN);
  const kinds = st.rows.map((r) => r.kind);
  assert.equal(kinds.filter((k) => k === "payment").length, 2);
  assert.equal(kinds.filter((k) => k === "tax_fee").length, 2);
  assert.equal(kinds.filter((k) => k === "consumption").length, 3);
  // Un negativo dentro del detalle de consumo es una devolucion.
  assert.equal(kinds.filter((k) => k === "refund").length, 1);
});

test("el monto en dolares no se confunde con el de pesos", () => {
  const st = parseGaliciaStatement(RESUMEN);
  const usd = st.rows.filter((r) => r.currency === "USD");
  assert.equal(usd.length, 2);
  const consumo = usd.find((r) => r.kind === "consumption")!;
  assert.equal(consumo.amount, 700);
  // El marcador de moneda se conserva: es parte de la linea del banco.
  assert.equal(consumo.rawDescription, "SERVICIO EXTERIOR USD");
});

test("detecta cuotas", () => {
  const st = parseGaliciaStatement(RESUMEN);
  const cuota = st.rows.find((r) => r.cuotaCurrent !== null)!;
  assert.equal(cuota.rawDescription, "COMERCIO DOS");
  assert.equal(cuota.cuotaCurrent, 2);
  assert.equal(cuota.cuotaTotal, 6);
});

test("imputa cada consumo a su plastico, y el bloque consolidado a ninguno", () => {
  const st = parseGaliciaStatement(RESUMEN);
  const conTarjeta = st.rows.filter((r) => r.cardLast4 === "1234");
  assert.equal(conTarjeta.length, 4);
  // Pagos e impuestos son del resumen, no de una tarjeta.
  for (const r of st.rows.filter((x) => x.kind === "payment" || x.kind === "tax_fee")) {
    assert.equal(r.cardLast4, null);
  }
});

test("el gate pasa cuando el resumen cierra al centavo", () => {
  const rec = reconcile(parseGaliciaStatement(RESUMEN));
  assert.equal(rec.ok, true);
  assert.deepEqual(rec.problems, []);
  assert.equal(rec.currencies.every((c) => c.difference === 0), true);
  assert.equal(rec.cards.every((c) => c.ok), true);
});

test("el gate rechaza si se pierde una fila", () => {
  // Una linea salteada es el modo de falla que este gate existe para atrapar.
  const mutilado = RESUMEN.replace("01-08-26 * COMERCIO UNO 000111 1.500,00\n", "");
  const rec = reconcile(parseGaliciaStatement(mutilado));
  assert.equal(rec.ok, false);
  assert.match(rec.problems.join(" "), /ARS/);
  assert.equal(rec.currencies.find((c) => c.currency === "ARS")!.difference, -150000);
});

test("el gate rechaza si un monto se lee mal", () => {
  const alterado = RESUMEN.replace("000111 1.500,00", "000111 1.500,10");
  const rec = reconcile(parseGaliciaStatement(alterado));
  assert.equal(rec.ok, false);
});

test("el gate rechaza un PDF que no es un resumen", () => {
  const rec = reconcile(parseGaliciaStatement("una factura de luz cualquiera"));
  assert.equal(rec.ok, false);
  assert.match(rec.problems.join(" "), /ningun movimiento/);
});

test("las refinanciaciones son servicio de deuda, no compras", () => {
  const conPlan = RESUMEN.replace(
    "01-08-26 * COMERCIO UNO 000111 1.500,00",
    "02-01-26 PLAN V CONSOLID 5-12 (TNA 37,00) 000111 1.500,00",
  );
  const st = parseGaliciaStatement(conPlan);
  const plan = st.rows.find((r) => r.kind === "financing")!;
  assert.equal(plan.cuotaCurrent, 5);
  assert.equal(plan.cuotaTotal, 12);
  assert.equal(reconcile(st).ok, true);
});

/**
 * El mismo banco emite MASTERCARD con otro layout: fecha "28-Jul-26" en vez de
 * "28-07-26", dolares marcados "U$S" en vez de "USD", ajustes sin fecha, y sin
 * subtotal por plastico. Inventado igual que el otro.
 *
 * ARS  5.000,00 - 5.000,00 - 500,00 + 1.200,00 = 700,00
 * USD     10,00 -    10,00                     =   0,00
 */
const MASTERCARD = `
Resumen N° 000000000000001
Tarjeta Crédito MASTERCARD GOLD
20260820000000001H
23-Jul-26 03-Ago-26 20-Ago-26 01-Sep-26 24-Sep-26 05-Oct-26
CONSOLIDADO PESOS DÓLARES
SALDO ANTERIOR 5.000,00 10,00
28-Jul-26 SU PAGO U$S -10,00 0,00 -10,00
28-Jul-26 SU PAGO -5.000,00 -5.000,00
DEV PER RG 4815 30% -500,00
SALDO PENDIENTE 0,00 0,00
TOTAL CONSUMOS DEL MES 1.200,00 0,00
SUBTOTAL 700,00 0,00
TOTAL A PAGAR 700,00 0,00
DETALLE DEL CONSUMO
FECHA REFERENCIA COMPROBANTE PESOS DÓLARES
CUOTA DEL MES
28-Ene-26 TIENDA ONLINE 07/12 04168 1.200,00
SUBTOTAL 700,00 0,00
TOTAL A PAGAR 700,00 0,00
El monto de IVA discriminado no puede computarse como credito fiscal
Costo Financiero Total de Tasa Efectiva Anual (CFT TEA) 205,62%
Cuotas a vencer
$ 1.200,00 $ 1.200,00 $ 1.200,00
`;

test("lee el formato MASTERCARD, con su fecha y su marca de dolares", () => {
  const st = parseGaliciaStatement(MASTERCARD);
  assert.equal(st.brand, "MASTERCARD GOLD");
  assert.equal(st.periodClose, "2026-08-20");
  assert.equal(st.rows.length, 4);
  assert.deepEqual(st.unparsedLines, []);

  const compra = st.rows.find((r) => r.kind === "consumption")!;
  assert.equal(compra.occurredOn, "2026-01-28"); // "28-Ene-26"
  assert.equal(compra.rawDescription, "TIENDA ONLINE");
  assert.equal(compra.cuotaCurrent, 7);
  assert.equal(compra.cuotaTotal, 12);

  const enDolares = st.rows.filter((r) => r.currency === "USD");
  assert.equal(enDolares.length, 1);
  assert.equal(enDolares[0].amount, -1000);
});

test("la descripcion no se come el marcador de moneda", () => {
  const st = parseGaliciaStatement(MASTERCARD);
  const pagoUsd = st.rows.find((r) => r.currency === "USD")!;
  assert.equal(pagoUsd.rawDescription, "SU PAGO U$S");
  assert.equal(pagoUsd.kind, "payment");
});

test("un ajuste sin fecha se imputa al cierre del periodo", () => {
  const st = parseGaliciaStatement(MASTERCARD);
  const dev = st.rows.find((r) => r.rawDescription.startsWith("DEV PER"))!;
  assert.equal(dev.occurredOn, "2026-08-20");
  // Una devolucion de percepcion es un impuesto en negativo, no el reintegro
  // de una compra: si fuera refund restaria del consumo del mes.
  assert.equal(dev.kind, "tax_fee");
  assert.equal(dev.amount, -50000);
});

test("la letra chica y los totales no se cuelan como movimientos", () => {
  const st = parseGaliciaStatement(MASTERCARD);
  const textos = st.rows.map((r) => r.rawDescription).join(" | ");
  assert.doesNotMatch(textos, /SUBTOTAL|TOTAL|SALDO|CFT|Cuotas a vencer/i);
  // El renglon de fechas de la cabecera tampoco es un movimiento.
  assert.equal(st.rows.length, 4);
});

test("el gate pasa con el resumen MASTERCARD entero", () => {
  const rec = reconcile(parseGaliciaStatement(MASTERCARD));
  assert.equal(rec.ok, true, rec.problems.join(" / "));
  assert.equal(rec.currencies.find((c) => c.currency === "ARS")!.declared, 70000);
  // Este formato no trae subtotal por plastico: no hay control cruzado que hacer.
  assert.equal(rec.cards.length, 0);
});

test("el gate rechaza el MASTERCARD si se pierde una fila", () => {
  const mutilado = MASTERCARD.replace("DEV PER RG 4815 30% -500,00\n", "");
  assert.equal(reconcile(parseGaliciaStatement(mutilado)).ok, false);
});

test("lo que el resumen trae pero no se rastrea queda marcado", () => {
  const st = parseGaliciaStatement(MASTERCARD);
  const porDescripcion = new Map(st.rows.map((r) => [r.rawDescription, r]));

  // El pago mueve plata entre cuentas propias.
  assert.equal(porDescripcion.get("SU PAGO")!.tracked, false);
  assert.equal(porDescripcion.get("SU PAGO U$S")!.tracked, false);

  // La devolucion de percepcion es el banco reintegrando un impuesto cobrado
  // de mas en un resumen anterior: no es plata que se gaste este mes.
  assert.equal(porDescripcion.get("DEV PER RG 4815 30%")!.tracked, false);

  // Una compra si se rastrea.
  assert.equal(porDescripcion.get("TIENDA ONLINE")!.tracked, true);
});

test("la variante DEV.IMP de VISA se trata igual que DEV PER", () => {
  // Son la misma linea con otro nombre segun la tarjeta: seria raro que una
  // entre y la otra no.
  const conDevImp = MASTERCARD.replace(
    "DEV PER RG 4815 30% -500,00",
    "DEV.IMP. RG 5617 30%( 1600,00) -500,00",
  );
  const st = parseGaliciaStatement(conDevImp);
  const dev = st.rows.find((r) => r.rawDescription.startsWith("DEV.IMP"))!;
  assert.equal(dev.tracked, false);
  // Y sigue reconciliando: se transcribe igual, solo no se importa.
  assert.equal(reconcile(st).ok, true);
});

test("no rastrear una linea no rompe la reconciliacion", () => {
  const st = parseGaliciaStatement(MASTERCARD);
  assert.equal(reconcile(st).ok, true);
  // Las filas no rastreadas siguen sumando en el gate.
  assert.ok(st.rows.some((r) => !r.tracked));
});
