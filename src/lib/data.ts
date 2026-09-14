import "server-only";

import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/retry";
import { centsFromDb, type Cents } from "@/lib/money";
import {
  balanceSign,
  periodRange,
  SPENDING_KINDS,
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
  " account:accounts!inner(id, name, is_liability), category:categories(id, name)";

type RawTransaction = Omit<Transaction, "amount"> & { amount: number };

function toTransaction(row: RawTransaction): Transaction {
  return { ...row, amount: centsFromDb(row.amount) };
}

export async function getTransactionsForPeriod(period: Period): Promise<Transaction[]> {
  const { from, to } = periodRange(period);
  const supabase = await createClient();
  const { data, error } = await withRetry(() =>
    supabase
      .from("transactions")
      .select(TX_SELECT)
      .gte("occurred_on", from)
      .lte("occurred_on", to)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
  );
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);
  return (data as unknown as RawTransaction[]).map(toTransaction);
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

    if (SPENDING_KINDS.includes(tx.kind)) {
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

export type AccountBalance = Account & { balance: Cents; movements: number };

/**
 * Saldo por cuenta sobre todo el historial.
 *
 * El saldo es con signo y desde el punto de vista de la cuenta: una tarjeta con
 * deuda da negativo. Las proyecciones de cuotas (`is_projected`) no entran, son
 * compromisos futuros y no plata ya movida.
 */
export async function getAccountBalances(): Promise<AccountBalance[]> {
  const supabase = await createClient();

  const [accounts, movements] = await Promise.all([
    getAccounts(),
    withRetry(() =>
      supabase.from("transactions").select("account_id, amount, kind").eq("is_projected", false),
    ),
  ]);

  if (movements.error) {
    throw new Error(`No se pudieron leer los saldos: ${movements.error.message}`);
  }

  const byAccount = new Map(accounts.map((a) => [a.id, a]));
  const balances = new Map<string, { balance: Cents; movements: number }>();

  for (const row of movements.data ?? []) {
    const account = byAccount.get(row.account_id);
    if (!account) continue;
    const entry = balances.get(row.account_id) ?? { balance: 0, movements: 0 };
    entry.balance +=
      balanceSign(row.kind as Kind, account.is_liability) * centsFromDb(row.amount);
    entry.movements += 1;
    balances.set(row.account_id, entry);
  }

  return accounts.map((account) => ({
    ...account,
    balance: balances.get(account.id)?.balance ?? 0,
    movements: balances.get(account.id)?.movements ?? 0,
  }));
}
