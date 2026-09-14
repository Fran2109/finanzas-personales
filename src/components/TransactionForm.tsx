"use client";

import { useActionState, useMemo, useState } from "react";
import { createTransaction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import {
  KIND_HELP,
  KIND_LABELS,
  MANUAL_KINDS,
  type Currency,
  type Kind,
} from "@/lib/domain";
import type { Account, Category } from "@/lib/data";

/** Que categorias tienen sentido para cada tipo de movimiento. */
const CATEGORY_KIND_FOR: Record<Kind, string> = {
  consumption: "expense",
  refund: "expense",
  income: "income",
  tax_fee: "tax_fee",
  financing: "financing",
  transfer: "transfer",
  payment: "transfer",
};

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-xs font-medium uppercase tracking-wide text-muted mb-1.5";

export function TransactionForm({
  accounts,
  categories,
  defaultDate,
}: {
  accounts: Account[];
  categories: Category[];
  defaultDate: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(createTransaction, {});
  const [kind, setKind] = useState<Kind>("consumption");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  const account = accounts.find((a) => a.id === accountId);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === CATEGORY_KIND_FOR[kind]),
    [categories, kind],
  );

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted">
        Primero crea una cuenta en{" "}
        <a className="text-accent underline" href="/cuentas">
          Cuentas
        </a>
        .
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <span className={label}>Tipo</span>
        <div className="flex flex-wrap gap-1.5">
          {MANUAL_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
                kind === k
                  ? "border-accent bg-accent text-background"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <input type="hidden" name="kind" value={kind} />
        <p className="mt-2 text-xs leading-relaxed text-muted">{KIND_HELP[kind]}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="amount">
            Monto
          </label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="12.500,40"
            required
            autoFocus
            className={`${field} tabular`}
          />
        </div>
        <div>
          <label className={label} htmlFor="currency">
            Moneda
          </label>
          <select
            id="currency"
            name="currency"
            defaultValue={(account?.currency ?? "ARS") as Currency}
            key={account?.currency}
            className={field}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="occurred_on">
            Fecha
          </label>
          <input
            id="occurred_on"
            name="occurred_on"
            type="date"
            defaultValue={defaultDate}
            required
            className={`${field} tabular`}
          />
        </div>
        <div>
          <label className={label} htmlFor="account_id">
            Cuenta
          </label>
          <select
            id="account_id"
            name="account_id"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={field}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="description">
          Descripcion
        </label>
        <input
          id="description"
          name="description"
          autoComplete="off"
          placeholder="Coto, nafta, Netflix..."
          className={field}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="category_id">
            Categoria
          </label>
          <select id="category_id" name="category_id" className={field} key={kind}>
            <option value="">Sin categoria</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {account?.is_liability ? (
          <div>
            <label className={label} htmlFor="card_last4">
              Plastico
            </label>
            <input
              id="card_last4"
              name="card_last4"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              className={`${field} tabular`}
            />
          </div>
        ) : null}
      </div>

      {state.error ? (
        <p className="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md border border-positive/40 bg-positive/10 px-3 py-2 text-sm text-positive">
          {state.ok}
        </p>
      ) : null}

      <SubmitButton className="w-full">Agregar movimiento</SubmitButton>
    </form>
  );
}
