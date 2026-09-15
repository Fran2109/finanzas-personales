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
  /** Periodo en el que termina de pagarse. */
  endsOn: Period;
  /** Lo que falta pagar en total. */
  remainingTotal: Cents;
};

/** Un mes que viene, con lo que ya esta comprometido. */
export type FuturePeriod = {
  period: Period;
  /** Total comprometido por moneda. */
  totals: { currency: Currency; total: Cents }[];
  /** Que planes caen en ese mes. */
  plans: { key: string; description: string; amount: Cents; currency: Currency; cuota: number }[];
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
export function openPlans(rows: InstallmentRow[]): Plan[] {
  const ultima = new Map<string, InstallmentRow>();

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
    const remaining = row.cuotaTotal - row.cuotaCurrent;
    if (remaining <= 0) continue;
    planes.push({
      key,
      accountName: row.accountName,
      description: row.description,
      categoryName: row.categoryName,
      amount: row.amount,
      currency: row.currency,
      cuotaCurrent: row.cuotaCurrent,
      cuotaTotal: row.cuotaTotal,
      remaining,
      lastSeen: row.period,
      endsOn: shiftPeriod(row.period, remaining),
      remainingTotal: row.amount * remaining,
    });
  }

  // Lo que mas pesa primero: es lo que decide si se puede tomar otra cuota.
  return planes.sort((a, b) => b.remainingTotal - a.remainingTotal);
}

/**
 * El calendario: mes por mes, que cae y cuanto suma.
 *
 * Arranca en el mes siguiente al ultimo resumen de cada plan, no en el mes
 * corriente: si el resumen de septiembre ya trajo la cuota 5, la 6 cae en
 * octubre aunque hoy sea 14 de septiembre.
 */
export function commitmentCalendar(planes: Plan[], months: number): FuturePeriod[] {
  const porPeriodo = new Map<Period, FuturePeriod>();

  for (const plan of planes) {
    for (let i = 1; i <= plan.remaining; i++) {
      const period = shiftPeriod(plan.lastSeen, i);
      const entry =
        porPeriodo.get(period) ?? { period, totals: [], plans: [] };

      const total = entry.totals.find((t) => t.currency === plan.currency);
      if (total) total.total += plan.amount;
      else entry.totals.push({ currency: plan.currency, total: plan.amount });

      entry.plans.push({
        key: plan.key,
        description: plan.description,
        amount: plan.amount,
        currency: plan.currency,
        cuota: plan.cuotaCurrent + i,
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
    porCategoria.set(clave, (porCategoria.get(clave) ?? 0) + plan.remainingTotal);
  }
  return [...porCategoria]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
