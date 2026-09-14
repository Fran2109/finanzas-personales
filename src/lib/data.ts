import "server-only";

import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/retry";
import { centsFromDb, type Cents } from "@/lib/money";
import {
  countsInAnalysis,
  isPeriod,
  periodRange,
  type Currency,
  type Kind,
  type Period,
} from "@/lib/domain";

export type Account = {
  id: string;
  name: string;
  type: string;
  currency: Currency;
  is_liability: boolean;
  active: boolean;
};

export type Category = {
  id: string;
  name: string;
  kind: Kind;
};

export type Transaction = {
  id: string;
  occurred_on: string;
  amount: Cents;
  currency: Currency;
  kind: Kind;
  description: string | null;
  card_last4: string | null;
  is_projected: boolean;
  statement_period: string | null;
  created_at: string;
  account: { id: string; name: string; is_liability: boolean } | null;
  category: { id: string; name: string } | null;
};

export async function getAccounts(): Promise<Account[]> {
  const supabase = await createClient();
  const { data, error } = await withRetry(() =>
    supabase
      .from("accounts")
      .select("id, name, type, currency, is_liability, active")
      .order("is_liability")
      .order("name"),
  );
  if (error) throw new Error(`No se pudieron leer las cuentas: ${error.message}`);
  return (data ?? []) as Account[];
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await withRetry(() =>
    supabase.from("categories").select("id, name, kind").order("kind").order("name"),
  );
  if (error) throw new Error(`No se pudieron leer las categorias: ${error.message}`);
  return (data ?? []) as Category[];
}

const TX_SELECT =
  "id, occurred_on, amount, currency, kind, description, card_last4, is_projected," +
  " statement_period, created_at," +
  " account:accounts!inner(id, name, is_liability), category:categories(id, name)";

type RawTransaction = Omit<Transaction, "amount"> & { amount: number };

function toTransaction(row: RawTransaction): Transaction {
  return { ...row, amount: centsFromDb(row.amount) };
}

export async function getTransactionsForPeriod(period: Period): Promise<Transaction[]> {
  // El periodo se interpola en el filtro, asi que no puede venir de cualquier
  // lado sin validar.
  if (!isPeriod(period)) throw new Error(`Periodo invalido: ${period}`);
  const { from, to } = periodRange(period);
  const supabase = await createClient();
  // Un movimiento de tarjeta pertenece al mes de su resumen, aunque la compra
  // sea anterior: la plata sale cuando se paga el resumen. El resto cae por su
  // propia fecha.
  //
  // Van en dos consultas y no en un OR: los dos conjuntos son excluyentes, y
  // asi cada filtro es de los simples en vez de depender de la sintaxis anidada
  // de PostgREST. El volumen de un mes es chico, el costo es irrelevante.
  const [delResumen, porFecha] = await Promise.all([
    withRetry(() =>
      supabase.from("transactions").select(TX_SELECT).eq("statement_period", period),
    ),
    withRetry(() =>
      supabase
        .from("transactions")
        .select(TX_SELECT)
        .is("statement_period", null)
        .gte("occurred_on", from)
        .lte("occurred_on", to),
    ),
  ]);

  const error = delResumen.error ?? porFecha.error;
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);

  const rows = [
    ...((delResumen.data ?? []) as unknown as RawTransaction[]),
    ...((porFecha.data ?? []) as unknown as RawTransaction[]),
  ];

  rows.sort((a, b) =>
    a.occurred_on === b.occurred_on
      ? b.created_at.localeCompare(a.created_at)
      : b.occurred_on.localeCompare(a.occurred_on),
  );

  return rows.map(toTransaction);
}

/** Totales del mes. Sin `fx_rates` cargadas no se pesifica nada: se separa. */
export type CurrencyTotals = {
  spent: Cents;
  income: Cents;
  taxFee: Cents;
  financing: Cents;
  payments: Cents;
  /** Cuanto del consumo son cuotas. Es un subconjunto de `spent`. */
  installments: Cents;
};

const EMPTY_TOTALS: CurrencyTotals = {
  spent: 0,
  income: 0,
  taxFee: 0,
  financing: 0,
  payments: 0,
  installments: 0,
};

export type CategoryTotal = {
  id: string;
  name: string;
  currency: Currency;
  total: Cents;
};

export type MonthSummary = {
  totals: Map<Currency, CurrencyTotals>;
  byCategory: CategoryTotal[];
  count: number;
};

export function summarize(transactions: Transaction[]): MonthSummary {
  const totals = new Map<Currency, CurrencyTotals>();
  const categories = new Map<string, CategoryTotal>();

  for (const tx of transactions) {
    const bucket = totals.get(tx.currency) ?? { ...EMPTY_TOTALS };

    switch (tx.kind) {
      case "consumption":
        bucket.spent += tx.amount;
        break;
      // Una cuota es consumo igual: la plata salio. Se suma al total y se
      // guarda aparte solo para poder decir cuanto del mes ya estaba comprado.
      case "installment":
        bucket.spent += tx.amount;
        bucket.installments += tx.amount;
        break;
      case "refund":
        // Un reintegro resta del consumo del mes, no suma como ingreso.
        bucket.spent -= tx.amount;
        break;
      case "income":
        bucket.income += tx.amount;
        break;
      case "tax_fee":
        bucket.taxFee += tx.amount;
        break;
      case "financing":
        bucket.financing += tx.amount;
        break;
      case "payment":
        // El pago de la tarjeta no es gasto nuevo: se muestra aparte para poder
        // verlo sin que ensucie el consumo del mes.
        bucket.payments += tx.amount;
        break;
      case "transfer":
        break;
    }

    totals.set(tx.currency, bucket);

    // Al desglose entra toda la plata que sale: consumo, cuotas, impuestos y
    // costos financieros. Los pagos de tarjeta y las transferencias no, porque
    // mueven plata entre cuentas propias y ese gasto ya se conto cuando se
    // compro.
    if (countsInAnalysis(tx.kind)) {
      const key = `${tx.category?.id ?? "sin"}:${tx.currency}`;
      const entry =
        categories.get(key) ??
        {
          id: tx.category?.id ?? "sin",
          name: tx.category?.name ?? "Sin categoria",
          currency: tx.currency,
          total: 0,
        };
      entry.total += tx.kind === "refund" ? -tx.amount : tx.amount;
      categories.set(key, entry);
    }
  }

  const byCategory = [...categories.values()]
    .filter((c) => c.total !== 0)
    .sort((a, b) => b.total - a.total);

  return { totals, byCategory, count: transactions.length };
}

export type AccountActivity = Account & { movements: number };

/**
 * Cuentas con cuantos movimientos tiene cada una.
 *
 * No devuelve saldo: la app registra salidas, no lleva balances. El calculo
 * vive igual en `balanceSign`, documentado y testeado, para cuando haga falta.
 */
export async function getAccountsWithActivity(): Promise<AccountActivity[]> {
  const supabase = await createClient();

  const [accounts, movements] = await Promise.all([
    getAccounts(),
    withRetry(() => supabase.from("transactions").select("account_id")),
  ]);

  if (movements.error) {
    throw new Error(`No se pudieron contar los movimientos: ${movements.error.message}`);
  }

  const porCuenta = new Map<string, number>();
  for (const row of movements.data ?? []) {
    porCuenta.set(row.account_id, (porCuenta.get(row.account_id) ?? 0) + 1);
  }

  return accounts.map((account) => ({
    ...account,
    movements: porCuenta.get(account.id) ?? 0,
  }));
}
