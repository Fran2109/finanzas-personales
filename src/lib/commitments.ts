/**
 * Lo que ya debes: cuanto de los meses que vienen ya esta decidido.
 *
 * Una compra en 12 cuotas no es un gasto de este mes, es una decision que
 * genera 12 salidas de caja. Mirarla como gasto pasado esconde lo unico que
 * todavia se puede usar para decidir algo: cuanto de octubre y noviembre ya
 * esta vendido antes de que empiecen.
 *
 * No hay `installment_plans` cargados, asi que el plan hay que deducirlo de las
 * filas. La misma compra aparece una vez por resumen —la 1/3 en julio, la 2/3
 * en agosto— y contarlas todas seria triplicar una sola compra, asi que de cada
 * plan se toma **la cuota mas alta vista** y desde ahi se proyecta.
 *
 * **Un plan se reconoce por cuenta + cantidad de cuotas + monto de la cuota**,
 * y a proposito NO por el comercio. El comercio parece la parte obvia de la
 * identidad y es justamente la que falla: un mismo plan de refinanciacion se
 * llama "PLAN V CONSOLID 4-12" en un resumen, "5-12" en el siguiente —el numero
 * de cuota va pegado al nombre— y el home banking encima la llama con otro
 * nombre de producto. Tres
 * nombres para una sola deuda, que contada por nombre se triplica.
 *
 * El monto se compara **redondeado al peso**: una cuota fija de 14.633,34 puede
 * venir 14.633,33 al mes siguiente por como redondea el banco, y un centavo de
 * diferencia partiria el plan en dos.
 *
 * **Registrada no es pagada.** El resumen de un mes se paga a principios del
 * siguiente, asi que la cuota que ya entro en el resumen del mes en curso esta
 * cargada y todavia no salio de la cuenta: cuenta como deuda. Por eso el plan
 * lleva dos numeros. `remaining` es lo que falta **registrarse** y es lo que
 * proyecta el calendario; `unpaid` es lo que falta **pagar** y es una cuota mas
 * cuando la ultima vista es la del mes en curso. Confundirlos subestima la
 * deuda justo en la cuota mas proxima, que es la unica que no se puede
 * esquivar.
 *
 * El limite de esta deduccion: dos compras distintas en la misma tarjeta, con
 * la misma cantidad de cuotas y la misma cuota mensual se leen como una sola.
 * Es mas raro que el caso del nombre, y su error —subestimar— es menos grave
 * que triplicar. Sin numero de plan en el resumen no hay forma de distinguirlas;
 * `installment_plans` existe para eso cuando la fase 2 lo modele.
 */
import { shiftPeriod, type Period } from "./domain.ts";
import type { Cents } from "./money.ts";
import type { Currency } from "./domain.ts";

/** Una cuota ya registrada, que es de donde sale todo lo que sigue. */
export type InstallmentRow = {
  accountId: string;
  accountName: string;
  merchant: string;
  description: string;
  categoryName: string | null;
  amount: Cents;
  currency: Currency;
  cuotaCurrent: number;
  cuotaTotal: number;
  /** El periodo del resumen donde aparecio esta cuota. */
  period: Period;
};

/** Un plan en curso, con lo que le falta. */
export type Plan = {
  key: string;
  accountId: string;
  accountName: string;
  description: string;
  categoryName: string | null;
  amount: Cents;
  currency: Currency;
  cuotaCurrent: number;
  cuotaTotal: number;
  /** Cuantas cuotas quedan despues de la ultima vista. */
  remaining: number;
  /** Periodo de la ultima cuota vista. */
  lastSeen: Period;
  /** Primer mes donde cae una cuota que todavia no esta registrada. */
  nextPeriod: Period;
  /**
   * La cuota no aparecio en el ultimo resumen cargado de la cuenta.
   *
   * O el plan termino antes de tiempo, o esa linea no se leyo. En los dos casos
   * lo que no se puede hacer es proyectarla dentro de un mes que ya se cargo.
   */
  behind: boolean;
  /** Periodo en el que termina de pagarse. */
  endsOn: Period;
  /** Lo que queda por registrarse: `remaining` cuotas. */
  remainingTotal: Cents;
  /**
   * Cuotas que faltan **pagar**, que no son las mismas que faltan registrarse.
   *
   * El resumen de un mes se paga a principios del siguiente, asi que la cuota
   * que ya entro en el resumen del mes en curso esta cargada pero todavia no
   * salio de la cuenta. Contarla como pagada subestima la deuda justo en la
   * cuota mas cercana, que es la unica que no se puede esquivar.
   */
  unpaid: number;
  /** Lo que falta pagar de verdad: `unpaid` cuotas. */
  unpaidTotal: Cents;
};

/** Un mes que viene, con lo que ya esta comprometido. */
export type FuturePeriod = {
  period: Period;
  /** Total comprometido por moneda. */
  totals: { currency: Currency; total: Cents }[];
  /** Que planes caen en ese mes. */
  plans: { key: string; description: string; amount: Cents; currency: Currency; cuota: number }[];
  /**
   * El mes ya esta cargado: lo que dice no es proyeccion sino lo que hay.
   *
   * Solo el mes en curso puede tener esto en true, y su numero es el mismo que
   * el de la vista del mes filtrando por Cuotas.
   */
  recorded: boolean;
};

function planKey(row: InstallmentRow): string {
  // Al peso: el centavo de diferencia entre un resumen y el siguiente es ruido
  // de redondeo del banco, no otra compra.
  const alPeso = Math.round(row.amount / 100);
  return [row.accountId, row.cuotaTotal, alPeso].join("|");
}

/**
 * De todas las cuotas registradas, que planes siguen abiertos.
 *
 * Un plan aparece una vez por resumen; se queda la cuota mas alta porque es la
 * que dice donde esta parado. Los que ya llegaron a la ultima cuota no
 * comprometen nada mas y quedan afuera.
 */
export function openPlans(
  rows: InstallmentRow[],
  /**
   * Hasta que mes hay movimientos cargados de cada cuenta.
   *
   * Es el limite entre lo que ya paso y lo que viene. Sin el, un plan cuya
   * ultima cuota quedo en agosto proyecta la siguiente a septiembre aunque el
   * resumen de septiembre ya este cargado, y entonces el mismo mes aparece a la
   * vez en "los meses que vienen" y en la vista del mes, con dos numeros
   * distintos. De las propias cuotas sale una aproximacion; la cuenta la sabe
   * de verdad quien tiene todos los movimientos, y por eso se puede pasar.
   */
  horizonteDeCuenta: ReadonlyMap<string, Period> = new Map(),
  /**
   * El mes cuyo resumen todavia no se pago.
   *
   * El resumen de un mes se paga a principios del siguiente, asi que la cuota
   * que ya entro en el resumen de este mes esta registrada pero todavia no
   * salio. Sin esto, `unpaid` es igual a `remaining` y la deuda queda
   * subestimada en la cuota mas proxima de cada plan.
   */
  mesSinPagar?: Period,
): Plan[] {
  const ultima = new Map<string, InstallmentRow>();
  const horizonte = new Map<string, Period>(horizonteDeCuenta);

  for (const row of rows) {
    const previo = horizonte.get(row.accountId);
    if (!previo || row.period > previo) horizonte.set(row.accountId, row.period);
  }

  for (const row of rows) {
    if (!row.cuotaTotal || !row.cuotaCurrent) continue;
    const key = planKey(row);
    const previa = ultima.get(key);
    // Desempata por periodo y no solo por numero de cuota: un resumen atrasado
    // puede traer una cuota vieja despues de haber visto una nueva.
    if (
      !previa ||
      row.cuotaCurrent > previa.cuotaCurrent ||
      (row.cuotaCurrent === previa.cuotaCurrent && row.period > previa.period)
    ) {
      ultima.set(key, row);
    }
  }

  const planes: Plan[] = [];
  for (const [key, row] of ultima) {
    const remaining = Math.max(0, row.cuotaTotal - row.cuotaCurrent);
    // La proyeccion arranca despues del ultimo mes cargado de la cuenta, no
    // despues de la ultima cuota vista: lo que ya esta cargado no es futuro.
    const desde = horizonte.get(row.accountId) ?? row.period;
    const base = desde > row.period ? desde : row.period;
    const nextPeriod = shiftPeriod(base, 1);
    // La cuota del mes en curso ya esta registrada pero se paga el mes que
    // viene, asi que cuenta como deuda. La del mes anterior no: esa ya salio.
    const unpaid = remaining + (mesSinPagar && row.period === mesSinPagar ? 1 : 0);
    // Un plan que pago su ultima cuota en el resumen en curso no proyecta nada
    // mas, pero todavia debe esa cuota: sale cuando el resumen se pague. Solo
    // se va de la lista cuando no queda nada por registrar NI por pagar.
    if (unpaid <= 0) continue;
    planes.push({
      key,
      accountId: row.accountId,
      accountName: row.accountName,
      description: row.description,
      categoryName: row.categoryName,
      amount: row.amount,
      currency: row.currency,
      cuotaCurrent: row.cuotaCurrent,
      cuotaTotal: row.cuotaTotal,
      remaining,
      lastSeen: row.period,
      nextPeriod,
      behind: base !== row.period,
      // Con `remaining` en 0 esto vuelve al mes en curso, que es cuando el plan
      // efectivamente termino: la cuota esta, lo que falta es el pago.
      endsOn: shiftPeriod(nextPeriod, remaining - 1),
      remainingTotal: row.amount * remaining,
      unpaid,
      unpaidTotal: row.amount * unpaid,
    });
  }

  // Lo que mas pesa primero: es lo que decide si se puede tomar otra cuota.
  return planes.sort((a, b) => b.unpaidTotal - a.unpaidTotal);
}

/**
 * El calendario: mes por mes, que cae y cuanto suma.
 *
 * Arranca en `nextPeriod`, que es el mes siguiente al ultimo que la cuenta
 * tiene cargado: si el resumen de septiembre ya esta, la cuota que sigue cae en
 * octubre aunque hoy sea 15 de septiembre. Nunca un mes que ya se cargo, o el
 * calendario y la vista del mes darian dos numeros para el mismo mes.
 */
export function commitmentCalendar(planes: Plan[], months: number): FuturePeriod[] {
  const porPeriodo = new Map<Period, FuturePeriod>();

  for (const plan of planes) {
    for (let i = 1; i <= plan.remaining; i++) {
      const period = shiftPeriod(plan.nextPeriod, i - 1);
      const entry =
        porPeriodo.get(period) ?? { period, totals: [], plans: [], recorded: false };

      const total = entry.totals.find((t) => t.currency === plan.currency);
      if (total) total.total += plan.amount;
      else entry.totals.push({ currency: plan.currency, total: plan.amount });

      entry.plans.push({
        key: plan.key,
        description: plan.description,
        amount: plan.amount,
        currency: plan.currency,
        cuota: plan.cuotaTotal - plan.remaining + i,
      });

      porPeriodo.set(period, entry);
    }
  }

  const ordenados = [...porPeriodo.values()].sort((a, b) =>
    a.period.localeCompare(b.period),
  );

  for (const p of ordenados) {
    p.totals.sort((a, b) => a.currency.localeCompare(b.currency));
    p.plans.sort((a, b) => b.amount - a.amount);
  }

  return ordenados.slice(0, months);
}

/**
 * El mes en curso al frente del calendario, con lo que ya esta cargado.
 *
 * El calendario proyecta, y este mes no hay que proyectarlo: ya esta
 * registrado. Por eso su numero sale de las filas y no de los planes, y es el
 * mismo que da la vista del mes filtrando por Cuotas. Proyectarlo ademas seria
 * contar dos veces la misma cuota, que es justo lo que el calendario evita al
 * arrancar despues del ultimo mes cargado.
 *
 * Lo unico que se le suma de la proyeccion es lo de las cuentas cuyo resumen de
 * este mes todavia no se cargo: ahi la cuota no esta en las filas porque nadie
 * la trajo, no porque no exista. El mes queda mitad hecho y mitad proyectado, y
 * `recorded` esta para que la pantalla lo pueda decir.
 */
export function withCurrentMonth(
  calendario: FuturePeriod[],
  rows: InstallmentRow[],
  period: Period,
): FuturePeriod[] {
  const delMes = rows.filter((r) => r.period === period && r.cuotaCurrent && r.cuotaTotal);
  // Sin nada cargado el mes no empezo a verse: es futuro como cualquier otro y
  // el calendario ya lo trae si algun plan cae ahi.
  if (delMes.length === 0) return calendario;

  const entry: FuturePeriod = { period, totals: [], plans: [], recorded: true };

  const sumar = (currency: Currency, amount: Cents) => {
    const total = entry.totals.find((t) => t.currency === currency);
    if (total) total.total += amount;
    else entry.totals.push({ currency, total: amount });
  };

  for (const row of delMes) {
    sumar(row.currency, row.amount);
    entry.plans.push({
      key: planKey(row),
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      cuota: row.cuotaCurrent,
    });
  }

  // Lo que el calendario proyecte en este mismo mes es de una cuenta que
  // todavia no cargo su resumen; no puede estar duplicado con lo de arriba.
  const proyectado = calendario.find((m) => m.period === period);
  for (const plan of proyectado?.plans ?? []) {
    sumar(plan.currency, plan.amount);
    entry.plans.push(plan);
  }

  entry.totals.sort((a, b) => a.currency.localeCompare(b.currency));
  entry.plans.sort((a, b) => b.amount - a.amount);

  return [entry, ...calendario.filter((m) => m.period !== period)];
}

/**
 * Cuanto de un mes ya estaba decidido antes de que empezara.
 *
 * Es el mismo numero que "cuotas" en la vista del mes, dicho de la forma en que
 * sirve para algo: sobre esa parte no se puede hacer nada este mes.
 */
export type CommittedShare = {
  currency: Currency;
  committed: Cents;
  discretionary: Cents;
  total: Cents;
  /** 0 a 1. Null si el mes no tiene nada, para no dividir por cero. */
  share: number | null;
};

export function committedShare(
  rows: { amount: Cents; currency: Currency; kind: string }[],
): CommittedShare[] {
  const porMoneda = new Map<Currency, CommittedShare>();

  for (const row of rows) {
    const entry =
      porMoneda.get(row.currency) ??
      {
        currency: row.currency,
        committed: 0,
        discretionary: 0,
        total: 0,
        share: null,
      };

    if (row.kind === "installment") entry.committed += row.amount;
    else entry.discretionary += row.amount;
    entry.total = entry.committed + entry.discretionary;

    porMoneda.set(row.currency, entry);
  }

  for (const entry of porMoneda.values()) {
    entry.share = entry.total === 0 ? null : entry.committed / entry.total;
  }

  return [...porMoneda.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * Un mes, con la cuota mensual que se tomo y la que se libero.
 *
 * `taken` es la suma de las cuotas de los planes que arrancaron ese mes (su
 * cuota 1); `released`, la de los que pagaron su ultima. El neto dice si el mes
 * que viene arranca con mas o con menos compromiso que el anterior.
 */
export type MonthFlow = {
  period: Period;
  currency: Currency;
  taken: Cents;
  released: Cents;
  /** taken - released. Positivo = quedaste mas comprometido que antes. */
  net: Cents;
  takenCount: number;
  releasedCount: number;
};

/**
 * Cuanto compromiso mensual entro y salio en cada mes.
 *
 * Es la pregunta que el calendario de compromisos no contesta: el calendario
 * dice cuanto falta, esto dice si la cosa va para arriba o para abajo. Un mes
 * con mucha cuota liberada y poca tomada es un mes en el que el futuro se
 * descomprimio, aunque el total gastado haya sido alto.
 *
 * Un plan que empezo antes del primer resumen importado nunca aparece como
 * tomado: no se lo vio arrancar. Eso es correcto —no se puede afirmar que se
 * tomo en un mes que no se miro— pero hace que los primeros meses de historia
 * subestimen lo tomado. Por eso la pantalla lo dice.
 */
export function installmentFlow(rows: InstallmentRow[]): MonthFlow[] {
  const porClave = new Map<string, MonthFlow>();

  const entrada = (period: Period, currency: Currency): MonthFlow => {
    const clave = `${period}|${currency}`;
    const previa = porClave.get(clave);
    if (previa) return previa;
    const fresca: MonthFlow = {
      period,
      currency,
      taken: 0,
      released: 0,
      net: 0,
      takenCount: 0,
      releasedCount: 0,
    };
    porClave.set(clave, fresca);
    return fresca;
  };

  for (const row of rows) {
    if (!row.cuotaTotal || !row.cuotaCurrent) continue;
    const mes = entrada(row.period, row.currency);

    if (row.cuotaCurrent === 1) {
      mes.taken += row.amount;
      mes.takenCount += 1;
    }
    // Un plan de una sola cuota arranca y termina el mismo mes: cuenta en los
    // dos lados y se neutraliza, que es exactamente lo que hace con la plata.
    if (row.cuotaCurrent === row.cuotaTotal) {
      mes.released += row.amount;
      mes.releasedCount += 1;
    }
    mes.net = mes.taken - mes.released;
  }

  return [...porClave.values()].sort(
    (a, b) => a.period.localeCompare(b.period) || a.currency.localeCompare(b.currency),
  );
}

/**
 * De lo que falta pagar, cuanto corresponde a cada categoria.
 *
 * Sirve sobre todo para separar lo que son cosas de lo que es costo de
 * financiarse: una deuda de la que la mitad son intereses no es lo mismo que
 * una del mismo tamano por compras.
 */
export function remainingByCategory(
  planes: Plan[],
  currency: Currency = "ARS",
): { label: string; value: Cents }[] {
  const porCategoria = new Map<string, Cents>();
  for (const plan of planes) {
    if (plan.currency !== currency) continue;
    const clave = plan.categoryName ?? "Sin categoria";
    porCategoria.set(clave, (porCategoria.get(clave) ?? 0) + plan.unpaidTotal);
  }
  return [...porCategoria]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
