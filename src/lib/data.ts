import "server-only";

import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/retry";
import { centsFromDb, type Cents } from "@/lib/money";
import {
  isExpenseKind,
  isPeriod,
  normalizeMerchant,
  periodOfDate,
  periodRange,
  type Currency,
  type Kind,
  type Period,
} from "@/lib/domain";
import type { InstallmentRow } from "@/lib/commitments";

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
  /** Solo los que vinieron de un resumen. Editarlos la invalida. */
  fingerprint: string | null;
  statement_period: string | null;
  created_at: string;
  account: { id: string; name: string; is_liability: boolean } | null;
  category: { id: string; name: string } | null;
};

export async function getAccounts(): Promise<Account[]> {
  const supabase = await createClient();
  const { data, error } = await withRetry(() =>
    supabase
      .from("finanzas_accounts")
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
    supabase.from("finanzas_categories").select("id, name, kind").order("kind").order("name"),
  );
  if (error) throw new Error(`No se pudieron leer las categorias: ${error.message}`);
  return (data ?? []) as Category[];
}

const TX_SELECT =
  "id, occurred_on, amount, currency, kind, description, card_last4, is_projected, fingerprint," +
  " statement_period, created_at," +
  " account:finanzas_accounts!inner(id, name, is_liability), category:finanzas_categories(id, name)";

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
      supabase.from("finanzas_transactions").select(TX_SELECT).eq("statement_period", period),
    ),
    withRetry(() =>
      supabase
        .from("finanzas_transactions")
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
  /** Todo lo que salio. Un monto negativo (una devolucion) resta solo. */
  total: Cents;
  /** Gastos sueltos. */
  purchases: Cents;
  /** Gastos en cuotas. */
  installments: Cents;
};

const EMPTY_TOTALS: CurrencyTotals = {
  total: 0,
  purchases: 0,
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

    // Dos tipos y nada mas. Los montos negativos (una devolucion, un ajuste a
    // favor) restan solos, sin necesitar un kind aparte.
    if (tx.kind === "installment") {
      bucket.installments += tx.amount;
    } else {
      bucket.purchases += tx.amount;
    }
    bucket.total = bucket.purchases + bucket.installments;

    totals.set(tx.currency, bucket);

    // Al desglose entra todo lo que la app registra, que es todo gasto.
    if (isExpenseKind(tx.kind)) {
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

/**
 * Todas las cuotas registradas, para proyectar compromisos.
 *
 * Trae el historial entero y no un mes: un plan de 12 cuotas puede haber
 * empezado mucho antes del mes que se este mirando, y lo que interesa es donde
 * esta parado hoy.
 */
export async function getInstallmentRows(): Promise<InstallmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await withRetry(() =>
    supabase
      .from("finanzas_transactions")
      .select(
        "amount, currency, occurred_on, statement_period, description, merchant_normalized, cuota_number, cuota_total, account:finanzas_accounts!inner(id, name), category:finanzas_categories(name)",
      )
      .eq("kind", "installment")
      .not("cuota_total", "is", null),
  );
  if (error) throw new Error(`No se pudieron leer las cuotas: ${error.message}`);

  const rows: InstallmentRow[] = [];
  for (const row of data ?? []) {
    const cuenta = row.account as unknown as { id: string; name: string } | null;
    const periodo = row.statement_period ?? periodOfDate(row.occurred_on);
    if (!cuenta || !periodo || !row.cuota_number || !row.cuota_total) continue;

    rows.push({
      accountId: cuenta.id,
      accountName: cuenta.name,
      merchant: row.merchant_normalized ?? normalizeMerchant(row.description ?? ""),
      description: row.description ?? "",
      categoryName:
        (row.category as unknown as { name: string } | null)?.name ?? null,
      amount: centsFromDb(row.amount),
      currency: row.currency as Currency,
      cuotaCurrent: row.cuota_number,
      cuotaTotal: row.cuota_total,
      period: periodo,
    });
  }
  return rows;
}

/** Lo minimo de cada movimiento para armar el historico por mes. */
export type MonthlyRow = {
  period: Period;
  accountId: string;
  amount: Cents;
  currency: Currency;
  kind: Kind;
  isProjected: boolean;
  categoryName: string;
};

/**
 * Todos los movimientos, reducidos a lo que hace falta para el historico.
 *
 * El volumen de esta app es chico, asi que se agrupa en memoria en vez de
 * pedirle a PostgREST un group by que tendria que replicar la regla de
 * "manda el resumen sobre la fecha de compra".
 */
export async function getMonthlyRows(): Promise<MonthlyRow[]> {
  const supabase = await createClient();
  const { data, error } = await withRetry(() =>
    supabase
      .from("finanzas_transactions")
      .select(
        "amount, currency, kind, occurred_on, statement_period, is_projected, account_id, category:finanzas_categories(name)",
      ),
  );
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);

  const rows: MonthlyRow[] = [];
  for (const row of data ?? []) {
    const periodo = row.statement_period ?? periodOfDate(row.occurred_on);
    if (!periodo) continue;
    rows.push({
      period: periodo,
      accountId: row.account_id,
      amount: centsFromDb(row.amount),
      currency: row.currency as Currency,
      kind: row.kind as Kind,
      isProjected: row.is_projected,
      categoryName:
        (row.category as unknown as { name: string } | null)?.name ?? "Sin categoria",
    });
  }
  return rows;
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
    withRetry(() => supabase.from("finanzas_transactions").select("account_id")),
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
