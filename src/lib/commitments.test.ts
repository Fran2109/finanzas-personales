import { test } from "node:test";
import assert from "node:assert/strict";

import {
  commitmentCalendar,
  committedShare,
  installmentFlow,
  openPlans,
  remainingByCategory,
  withCurrentMonth,
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

test("el calendario nunca cae en un mes que ya esta cargado", () => {
  // El bug que hacia que "los meses que vienen" y la vista del mes dieran dos
  // numeros para septiembre: la cuota de septiembre estaba cargada pero sin
  // total, asi que el plan se quedaba parado en agosto y proyectaba la
  // siguiente a septiembre, encima de la que ya estaba.
  const planes = openPlans(
    [cuota({ cuotaCurrent: 5, cuotaTotal: 7, period: "2026-08" })],
    new Map([["visa", "2026-09"]]),
  );
  const [plan] = planes;
  assert.equal(plan.behind, true, "la cuota no aparecio en el resumen de septiembre");
  assert.equal(plan.nextPeriod, "2026-10");
  assert.equal(plan.endsOn, "2026-11");
  assert.deepEqual(
    commitmentCalendar(planes, 12).map((p) => p.period),
    ["2026-10", "2026-11"],
  );
});

test("el horizonte de una cuenta no corre el plan de otra", () => {
  const planes = openPlans(
    [
      cuota({ accountId: "visa", cuotaCurrent: 1, cuotaTotal: 2, period: "2026-08" }),
      cuota({ accountId: "master", cuotaCurrent: 1, cuotaTotal: 2, period: "2026-09" }),
    ],
    new Map([["master", "2026-09"]]),
  );
  const visa = planes.find((p) => p.accountId === "visa")!;
  const master = planes.find((p) => p.accountId === "master")!;
  assert.equal(visa.nextPeriod, "2026-09", "de visa no hay nada mas nuevo que agosto");
  assert.equal(visa.behind, false);
  assert.equal(master.nextPeriod, "2026-10");
});

test("el numero de cuota proyectado sigue al plan aunque se atrase", () => {
  // Si la cuota 6 no se vio y el plan arranca en octubre, octubre es la 6: se
  // salteo el resumen, no la cuota.
  const planes = openPlans(
    [cuota({ cuotaCurrent: 5, cuotaTotal: 7, period: "2026-08" })],
    new Map([["visa", "2026-09"]]),
  );
  const cal = commitmentCalendar(planes, 12);
  assert.deepEqual(
    cal.map((p) => p.plans[0].cuota),
    [6, 7],
  );
});

test("un plan que termina en el resumen en curso todavia falta pagarlo", () => {
  // Pago su ultima cuota en septiembre: no proyecta nada mas, pero esa cuota
  // sale recien cuando se pague el resumen, a principios de octubre.
  const [plan] = openPlans(
    [cuota({ cuotaCurrent: 3, cuotaTotal: 3, period: "2026-09" })],
    new Map([["visa", "2026-09"]]),
    "2026-09",
  );
  assert.ok(plan, "no puede desaparecer de la lista: todavia se debe");
  assert.equal(plan.remaining, 0, "no queda nada por registrarse");
  assert.equal(plan.unpaid, 1);
  assert.equal(plan.endsOn, "2026-09", "termino en el mes en curso");
  assert.deepEqual(commitmentCalendar([plan], 12), [], "y no proyecta nada");
});

test("un plan terminado en un resumen ya pagado si desaparece", () => {
  const planes = openPlans(
    [cuota({ cuotaCurrent: 3, cuotaTotal: 3, period: "2026-08" })],
    new Map(),
    "2026-09",
  );
  assert.equal(planes.length, 0, "se pago en septiembre, no se debe nada");
});

test("la cuota del resumen en curso falta pagar aunque ya este cargada", () => {
  // El resumen de septiembre se paga a principios de octubre: esa cuota esta
  // registrada y todavia no salio de la cuenta.
  const [plan] = openPlans(
    [cuota({ cuotaCurrent: 5, cuotaTotal: 7, period: "2026-09" })],
    new Map([["visa", "2026-09"]]),
    "2026-09",
  );
  assert.equal(plan.remaining, 2, "faltan registrarse la 6 y la 7");
  assert.equal(plan.unpaid, 3, "faltan pagar la 5, la 6 y la 7");
  assert.equal(plan.unpaidTotal, 300000);
  assert.equal(plan.remainingTotal, 200000, "lo que proyecta el calendario no cambia");
});

test("la cuota de un resumen ya pagado no cuenta como deuda", () => {
  // La ultima vista es de agosto, que se pago a principios de septiembre.
  const [plan] = openPlans(
    [cuota({ cuotaCurrent: 5, cuotaTotal: 7, period: "2026-08" })],
    new Map(),
    "2026-09",
  );
  assert.equal(plan.unpaid, plan.remaining, "no hay nada sin pagar del mes en curso");
  assert.equal(plan.unpaid, 2);
});

test("falta pagar es exactamente lo que suma el calendario con el mes en curso", () => {
  // Los dos numeros salen de la misma plata, asi que tienen que dar igual: si
  // no, la pantalla dice dos cosas distintas sobre la misma deuda.
  const rows = [
    cuota({ cuotaCurrent: 5, cuotaTotal: 7, period: "2026-09", amount: 60000 }),
    cuota({ merchant: "OTRO", cuotaCurrent: 1, cuotaTotal: 3, period: "2026-09", amount: 40000 }),
  ];
  const planes = openPlans(rows, new Map([["visa", "2026-09"]]), "2026-09");
  const cal = withCurrentMonth(commitmentCalendar(planes, 99), rows, "2026-09");

  const faltaPagar = planes.reduce((t, p) => t + p.unpaidTotal, 0);
  const sumaCalendario = cal.reduce(
    (t, m) => t + (m.totals.find((x) => x.currency === "ARS")?.total ?? 0),
    0,
  );
  assert.equal(faltaPagar, sumaCalendario);
});

test("sin mes en curso, falta pagar es lo que falta registrarse", () => {
  // El default: sin decirle cual es el mes sin pagar no se puede saber que
  // cuota sigue debiendose, y no se inventa.
  const [plan] = openPlans([cuota({ cuotaCurrent: 5, cuotaTotal: 7, period: "2026-09" })]);
  assert.equal(plan.unpaid, plan.remaining);
});

test("el mes en curso va adelante con lo cargado, no proyectado", () => {
  // Es el mes que se esta viviendo: su numero sale de las filas, no de los
  // planes, y tiene que dar lo mismo que la vista del mes filtrando por Cuotas.
  const rows = [
    cuota({ cuotaCurrent: 5, cuotaTotal: 7, period: "2026-09", amount: 60000 }),
    cuota({ merchant: "OTRO", cuotaCurrent: 1, cuotaTotal: 2, period: "2026-09", amount: 40000 }),
  ];
  const planes = openPlans(rows, new Map([["visa", "2026-09"]]));
  const cal = withCurrentMonth(commitmentCalendar(planes, 12), rows, "2026-09");

  assert.equal(cal[0].period, "2026-09");
  assert.equal(cal[0].recorded, true);
  assert.equal(cal[0].totals[0].total, 100000, "la suma es la de las filas cargadas");
  assert.equal(cal[1].period, "2026-10", "lo proyectado sigue arrancando despues");
  assert.equal(cal[1].recorded, false);
});

test("el mes en curso suma la cuota de la cuenta que todavia no cargo su resumen", () => {
  // Galicia ya cargo septiembre y Supervielle no: la cuota de Supervielle no
  // esta en las filas porque nadie la trajo, no porque no exista.
  const rows = [
    cuota({ accountId: "galicia", cuotaCurrent: 2, cuotaTotal: 4, period: "2026-09", amount: 60000 }),
    cuota({ accountId: "super", cuotaCurrent: 1, cuotaTotal: 4, period: "2026-08", amount: 40000 }),
  ];
  const planes = openPlans(rows, new Map([["galicia", "2026-09"], ["super", "2026-08"]]));
  const cal = withCurrentMonth(commitmentCalendar(planes, 12), rows, "2026-09");

  assert.equal(cal[0].period, "2026-09");
  assert.equal(cal[0].totals[0].total, 100000, "lo cargado de galicia mas lo proyectado de super");
  assert.equal(cal[0].plans.length, 2);
  assert.equal(
    cal.filter((m) => m.period === "2026-09").length,
    1,
    "septiembre no puede aparecer dos veces",
  );
});

test("un mes en curso sin nada cargado no se inventa", () => {
  // Todavia no se cargo nada de septiembre: es futuro como cualquier otro y el
  // calendario ya lo trae si algun plan cae ahi.
  const rows = [cuota({ cuotaCurrent: 1, cuotaTotal: 3, period: "2026-08" })];
  const planes = openPlans(rows);
  const cal = withCurrentMonth(commitmentCalendar(planes, 12), rows, "2026-09");
  assert.equal(cal[0].period, "2026-09");
  assert.equal(cal[0].recorded, false, "es proyeccion, no algo cargado");
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

// Cuanto compromiso entra y sale cada mes
// ---------------------------------------------------------------------------

test("lo que arranca y lo que termina en cada mes", () => {
  const flujo = installmentFlow([
    // Arranca un plan de 3 en julio.
    cuota({ merchant: "UNO", amount: 100000, cuotaCurrent: 1, cuotaTotal: 3, period: "2026-07" }),
    cuota({ merchant: "UNO", amount: 100000, cuotaCurrent: 2, cuotaTotal: 3, period: "2026-08" }),
    cuota({ merchant: "UNO", amount: 100000, cuotaCurrent: 3, cuotaTotal: 3, period: "2026-09" }),
  ]);

  assert.equal(flujo.length, 3);
  assert.deepEqual(
    flujo.map((f) => [f.period, f.taken, f.released, f.net]),
    [
      ["2026-07", 100000, 0, 100000],
      // El mes del medio no mueve el compromiso: ni arranca ni termina nada.
      ["2026-08", 0, 0, 0],
      ["2026-09", 0, 100000, -100000],
    ],
  );
});

test("el neto dice si el mes que viene arranca mas o menos comprometido", () => {
  const flujo = installmentFlow([
    cuota({ merchant: "NUEVO", amount: 300000, cuotaCurrent: 1, cuotaTotal: 6, period: "2026-09" }),
    cuota({ merchant: "VIEJO", amount: 100000, cuotaCurrent: 3, cuotaTotal: 3, period: "2026-09" }),
  ]);
  const [sep] = flujo;
  assert.equal(sep.taken, 300000);
  assert.equal(sep.released, 100000);
  assert.equal(sep.net, 200000);
  assert.equal(sep.takenCount, 1);
  assert.equal(sep.releasedCount, 1);
});

test("un plan de una sola cuota entra y sale el mismo mes", () => {
  // Arranca y termina a la vez: sobre el compromiso futuro no deja nada, que
  // es exactamente lo que hace con la plata.
  const [mes] = installmentFlow([
    cuota({ amount: 50000, cuotaCurrent: 1, cuotaTotal: 1, period: "2026-09" }),
  ]);
  assert.equal(mes.taken, 50000);
  assert.equal(mes.released, 50000);
  assert.equal(mes.net, 0);
});

test("un plan que ya venia en curso no cuenta como tomado", () => {
  // Empezo antes del primer resumen importado: no se lo vio arrancar, y decir
  // que se tomo en un mes que no se miro seria inventarlo.
  const [mes] = installmentFlow([
    cuota({ amount: 500000, cuotaCurrent: 6, cuotaTotal: 12, period: "2026-09" }),
  ]);
  assert.equal(mes.taken, 0);
  assert.equal(mes.released, 0);
  assert.equal(mes.net, 0);
});

test("cada moneda lleva su propia cuenta", () => {
  const flujo = installmentFlow([
    cuota({ amount: 100000, currency: "ARS", cuotaCurrent: 1, cuotaTotal: 3, period: "2026-09" }),
    cuota({ amount: 2000, currency: "USD", cuotaCurrent: 1, cuotaTotal: 3, period: "2026-09" }),
  ]);
  assert.equal(flujo.length, 2);
  assert.deepEqual(
    flujo.map((f) => [f.currency, f.taken]),
    [["ARS", 100000], ["USD", 2000]],
  );
});

test("de lo que falta pagar, cuanto es de cada categoria", () => {
  const planes = openPlans([
    cuota({ merchant: "A", categoryName: "Financiacion", amount: 500000, cuotaCurrent: 1, cuotaTotal: 3 }),
    cuota({ merchant: "B", categoryName: "Compras", amount: 100000, cuotaCurrent: 1, cuotaTotal: 3 }),
    cuota({ merchant: "C", categoryName: "Compras", amount: 200000, cuotaCurrent: 1, cuotaTotal: 3 }),
  ]);
  assert.deepEqual(remainingByCategory(planes), [
    { label: "Financiacion", value: 1000000 },
    { label: "Compras", value: 600000 },
  ]);
});

test("una cuota sin categoria no desaparece del reparto", () => {
  const planes = openPlans([
    cuota({ categoryName: null, amount: 100000, cuotaCurrent: 1, cuotaTotal: 3 }),
  ]);
  assert.deepEqual(remainingByCategory(planes), [{ label: "Sin categoria", value: 200000 }]);
});
