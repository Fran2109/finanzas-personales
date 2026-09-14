import { test } from "node:test";
import assert from "node:assert/strict";

import {
  commitmentCalendar,
  committedShare,
  openPlans,
  type InstallmentRow,
} from "./commitments.ts";

function cuota(over: Partial<InstallmentRow> = {}): InstallmentRow {
  const merged: InstallmentRow = {
    accountId: "visa",
    accountName: "Tarjeta",
    merchant: "COMERCIO UNO",
    description: "COMERCIO UNO",
    categoryName: "Compras",
    amount: 100000,
    currency: "ARS",
    cuotaCurrent: 1,
    cuotaTotal: 3,
    period: "2026-07",
    ...over,
  };
  // La descripcion sigue al comercio salvo que se pida otra, para que cambiar
  // uno solo en un caso no deje el fixture incoherente.
  return { ...merged, description: over.description ?? merged.merchant };
}

test("la misma compra en tres resumenes es un plan, no tres", () => {
  // Es el error que haria inutil todo el calculo: cada resumen trae la cuota
  // del mes y contarlas todas triplicaria una sola compra.
  const planes = openPlans([
    cuota({ cuotaCurrent: 1, period: "2026-07" }),
    cuota({ cuotaCurrent: 2, period: "2026-08" }),
    cuota({ cuotaCurrent: 3, period: "2026-09" }),
  ]);
  assert.equal(planes.length, 0, "una compra de 3 cuotas ya pagada no compromete nada");
});

test("de cada plan se toma la cuota mas alta vista", () => {
  const [plan] = openPlans([
    cuota({ cuotaCurrent: 1, period: "2026-07" }),
    cuota({ cuotaCurrent: 2, period: "2026-08" }),
  ]);
  assert.equal(plan.cuotaCurrent, 2);
  assert.equal(plan.remaining, 1);
  assert.equal(plan.lastSeen, "2026-08");
  assert.equal(plan.endsOn, "2026-09");
  assert.equal(plan.remainingTotal, 100000);
});

test("el orden en que llegan las cuotas no cambia el resultado", () => {
  // Los resumenes se cargan en cualquier orden: primero agosto y despues julio
  // es normal.
  const desordenado = openPlans([
    cuota({ cuotaCurrent: 2, period: "2026-08" }),
    cuota({ cuotaCurrent: 1, period: "2026-07" }),
  ]);
  assert.equal(desordenado[0].cuotaCurrent, 2);
  assert.equal(desordenado[0].remaining, 1);
});

test("planes distintos no se mezclan", () => {
  const planes = openPlans([
    cuota({ cuotaCurrent: 1, cuotaTotal: 6, amount: 100000 }),
    // Otra cantidad de cuotas: es otra compra.
    cuota({ cuotaCurrent: 1, cuotaTotal: 12, amount: 100000 }),
    // Otra tarjeta: es otra compra.
    cuota({ accountId: "master", cuotaCurrent: 1, cuotaTotal: 6, amount: 100000 }),
    // Otra cuota mensual: es otra compra.
    cuota({ cuotaCurrent: 1, cuotaTotal: 6, amount: 250000 }),
  ]);
  assert.equal(planes.length, 4);
});

test("el mismo plan con distinto nombre en cada resumen es uno solo", () => {
  // El caso que hacia triplicar una deuda real: una refinanciacion lleva el
  // numero de cuota pegado al nombre, asi que cambia de nombre todos los meses,
  // y el home banking encima la llama distinto que el PDF.
  const planes = openPlans([
    cuota({ merchant: "PLAN CONSOLID 4 12", cuotaCurrent: 4, cuotaTotal: 12, amount: 500000, period: "2026-07" }),
    cuota({ merchant: "PLAN CONSOLID 5 12", cuotaCurrent: 5, cuotaTotal: 12, amount: 500000, period: "2026-08" }),
    cuota({ merchant: "PLAN OTRO NOMBRE",   cuotaCurrent: 6, cuotaTotal: 12, amount: 500000, period: "2026-09" }),
  ]);
  assert.equal(planes.length, 1);
  assert.equal(planes[0].cuotaCurrent, 6);
  assert.equal(planes[0].remaining, 6);
  assert.equal(planes[0].remainingTotal, 3000000);
  // Se muestra con el nombre mas reciente, que es el que uno acaba de ver.
  assert.equal(planes[0].description, "PLAN OTRO NOMBRE");
});

test("un centavo de redondeo no parte el plan en dos", () => {
  // Una cuota fija puede venir 14.633,34 un mes y 14.633,33 al siguiente.
  const planes = openPlans([
    cuota({ cuotaCurrent: 1, cuotaTotal: 3, amount: 1463334, period: "2026-08" }),
    cuota({ cuotaCurrent: 2, cuotaTotal: 3, amount: 1463333, period: "2026-09" }),
  ]);
  assert.equal(planes.length, 1);
  assert.equal(planes[0].remaining, 1);
});

test("una compra nueva no la tapa un plan viejo ya terminado", () => {
  // Mismo comercio y misma cantidad de cuotas que una compra que ya se
  // termino de pagar. Por monto se distinguen, y la nueva tiene que aparecer:
  // tomar la cuota mas alta sin distinguirlas la borraba.
  const planes = openPlans([
    cuota({ cuotaCurrent: 1, cuotaTotal: 3, amount: 287015, period: "2026-07" }),
    cuota({ cuotaCurrent: 2, cuotaTotal: 3, amount: 287015, period: "2026-08" }),
    cuota({ cuotaCurrent: 3, cuotaTotal: 3, amount: 287015, period: "2026-09" }),
    cuota({ cuotaCurrent: 1, cuotaTotal: 3, amount: 109509, period: "2026-09" }),
  ]);
  assert.equal(planes.length, 1);
  assert.equal(planes[0].amount, 109509);
  assert.equal(planes[0].remaining, 2);
});

test("el limite conocido: dos compras identicas se leen como una", () => {
  // Misma tarjeta, mismas cuotas y misma cuota mensual. Sin numero de plan en
  // el resumen no hay con que distinguirlas, y se subestima el compromiso.
  // Queda escrito para que sea una limitacion conocida y no una sorpresa.
  const planes = openPlans([
    cuota({ merchant: "UNO", cuotaCurrent: 1, cuotaTotal: 3, amount: 100000 }),
    cuota({ merchant: "DOS", cuotaCurrent: 1, cuotaTotal: 3, amount: 100000 }),
  ]);
  assert.equal(planes.length, 1);
});

test("una cuota sin total no se proyecta", () => {
  // Cargada a mano sin decir de cuantas es: no se puede saber que falta.
  const planes = openPlans([cuota({ cuotaTotal: 0 })]);
  assert.equal(planes.length, 0);
});

test("el calendario reparte una cuota por mes desde el mes siguiente", () => {
  // La 1 de 3 se vio en el resumen de julio, asi que faltan agosto y
  // septiembre. No arranca en el mes corriente: arranca despues de la ultima
  // cuota vista.
  const planes = openPlans([cuota({ cuotaCurrent: 1, cuotaTotal: 3, period: "2026-07" })]);
  const cal = commitmentCalendar(planes, 12);
  assert.deepEqual(
    cal.map((p) => p.period),
    ["2026-08", "2026-09"],
  );
  assert.equal(cal[0].plans[0].cuota, 2);
  assert.equal(cal[1].plans[0].cuota, 3);
  assert.equal(cal[0].totals[0].total, 100000);
});

test("varios planes se suman en el mes que coinciden", () => {
  const planes = openPlans([
    cuota({ merchant: "UNO", amount: 100000, cuotaCurrent: 1, cuotaTotal: 3 }),
    cuota({ merchant: "DOS", amount: 50000, cuotaCurrent: 1, cuotaTotal: 2 }),
  ]);
  const cal = commitmentCalendar(planes, 12);
  assert.equal(cal[0].period, "2026-08");
  assert.equal(cal[0].totals[0].total, 150000);
  assert.equal(cal[1].period, "2026-09");
  assert.equal(cal[1].totals[0].total, 100000);
});

test("cada moneda se cuenta por separado, nunca pesificada", () => {
  const planes = openPlans([
    cuota({ merchant: "UNO", amount: 100000, currency: "ARS", cuotaCurrent: 1, cuotaTotal: 2 }),
    cuota({ merchant: "DOS", amount: 2000, currency: "USD", cuotaCurrent: 1, cuotaTotal: 2 }),
  ]);
  const [agosto] = commitmentCalendar(planes, 12);
  assert.deepEqual(agosto.totals, [
    { currency: "ARS", total: 100000 },
    { currency: "USD", total: 2000 },
  ]);
});

test("el calendario se corta donde se le pide", () => {
  const planes = openPlans([cuota({ cuotaCurrent: 1, cuotaTotal: 12, period: "2026-07" })]);
  assert.equal(commitmentCalendar(planes, 3).length, 3);
  assert.equal(commitmentCalendar(planes, 99).length, 11);
});

test("el plan que mas pesa va primero", () => {
  const planes = openPlans([
    cuota({ merchant: "CHICO", amount: 10000, cuotaCurrent: 1, cuotaTotal: 3 }),
    cuota({ merchant: "GRANDE", amount: 500000, cuotaCurrent: 1, cuotaTotal: 3 }),
  ]);
  assert.equal(planes[0].description, "GRANDE");
});

test("cuanto del mes ya estaba decidido antes de empezar", () => {
  const share = committedShare([
    { amount: 300000, currency: "ARS", kind: "installment" },
    { amount: 100000, currency: "ARS", kind: "consumption" },
    { amount: 2000, currency: "USD", kind: "consumption" },
  ]);
  const ars = share.find((s) => s.currency === "ARS")!;
  assert.equal(ars.committed, 300000);
  assert.equal(ars.discretionary, 100000);
  assert.equal(ars.total, 400000);
  assert.equal(ars.share, 0.75);

  const usd = share.find((s) => s.currency === "USD")!;
  assert.equal(usd.committed, 0);
  assert.equal(usd.share, 0);
});

test("un mes vacio no divide por cero", () => {
  assert.deepEqual(committedShare([]), []);
  const [solo] = committedShare([{ amount: 0, currency: "ARS", kind: "consumption" }]);
  assert.equal(solo.share, null);
});
