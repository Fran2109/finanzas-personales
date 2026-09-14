"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import { deleteTransaction, updateTransaction, type FormState } from "@/app/actions";
import { Amount } from "@/components/Amount";
import { SubmitButton } from "@/components/SubmitButton";
import {
  CATEGORY_KIND_FOR,
  KIND_LABELS,
  MANUAL_KINDS,
  type Kind,
} from "@/lib/domain";
import type { Account, Category, Transaction } from "@/lib/data";

const field =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";
const label = "block text-[10px] font-medium uppercase tracking-wide text-muted mb-1";

/**
 * Una fila del mes, que se abre para editarse.
 *
 * Editar en el lugar y no en otra pantalla: revisar el mes y corregir lo que
 * esta mal es el mismo gesto, y mandar a la persona a otro lado en el medio es
 * lo que hace que las correcciones no se hagan.
 */
export function TransactionRow({
  tx,
  accounts,
  categories,
}: {
  tx: Transaction;
  accounts: Account[];
  categories: Category[];
}) {
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`Editar ${tx.description ?? KIND_LABELS[tx.kind]}`}
        >
          <span className="tabular w-12 shrink-0 text-xs text-muted">
            {tx.occurred_on.slice(8)}/{tx.occurred_on.slice(5, 7)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              {tx.description || KIND_LABELS[tx.kind]}
              {tx.is_projected ? (
                <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                  provisorio
                </span>
              ) : null}
            </span>
            <span className="block truncate text-xs text-muted">
              {[
                tx.category?.name,
                tx.account?.name,
                tx.card_last4 ? `*${tx.card_last4}` : null,
                tx.kind === "consumption" ? null : KIND_LABELS[tx.kind],
                // Explica por que una compra de junio aparece en agosto.
                tx.statement_period && tx.statement_period !== tx.occurred_on.slice(0, 7)
                  ? `resumen ${tx.statement_period}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <Amount cents={tx.amount} currency={tx.currency} className="shrink-0" />
        </button>
        <form action={deleteTransaction}>
          <input type="hidden" name="id" value={tx.id} />
          <button
            type="submit"
            aria-label="Borrar movimiento"
            className="text-muted transition hover:text-negative"
          >
            &times;
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="bg-background/40 px-3 py-3">
      <Editor tx={tx} accounts={accounts} categories={categories} cerrar={() => setAbierto(false)} />
    </li>
  );
}

function Editor({
  tx,
  accounts,
  categories,
  cerrar,
}: {
  tx: Transaction;
  accounts: Account[];
  categories: Category[];
  cerrar: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateTransaction, {});
  const [kind, setKind] = useState<Kind>(tx.kind);
  const [accountId, setAccountId] = useState(tx.account?.id ?? accounts[0]?.id ?? "");

  const cuenta = accounts.find((a) => a.id === accountId);

  const visibles = useMemo(
    () => categories.filter((c) => c.kind === CATEGORY_KIND_FOR[kind]),
    [categories, kind],
  );

  // Guardar cierra la fila. El servidor ya revalido, asi que al cerrarse se ve
  // el valor nuevo y no el que se acaba de tipear.
  useEffect(() => {
    if (state.ok) cerrar();
  }, [state.ok, cerrar]);

  // El monto se edita con coma, como se tipea. En negativo si es una
  // devolucion: ahi el movimiento resta solo, sin necesitar un tipo aparte.
  const montoInicial = (tx.amount / 100).toFixed(2).replace(".", ",");

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={tx.id} />
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-wrap gap-1.5">
        {MANUAL_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-md border px-2.5 py-1 text-xs transition ${
              kind === k
                ? "border-accent bg-accent text-background"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <div>
        <label className={label} htmlFor={`desc-${tx.id}`}>
          Descripcion
        </label>
        <input
          id={`desc-${tx.id}`}
          name="description"
          defaultValue={tx.description ?? ""}
          autoComplete="off"
          autoFocus
          className={field}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 *:min-w-0 sm:grid-cols-4">
        <div>
          <label className={label} htmlFor={`monto-${tx.id}`}>
            Monto
          </label>
          <input
            id={`monto-${tx.id}`}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={montoInicial}
            required
            className={`${field} tabular`}
          />
        </div>
        <div>
          <label className={label} htmlFor={`mon-${tx.id}`}>
            Moneda
          </label>
          <select
            id={`mon-${tx.id}`}
            name="currency"
            defaultValue={tx.currency}
            className={field}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`fecha-${tx.id}`}>
            Fecha
          </label>
          <input
            id={`fecha-${tx.id}`}
            name="occurred_on"
            type="date"
            defaultValue={tx.occurred_on}
            required
            className={`${field} tabular`}
          />
        </div>
        <div>
          <label className={label} htmlFor={`cta-${tx.id}`}>
            Cuenta
          </label>
          <select
            id={`cta-${tx.id}`}
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

      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <div>
          <label className={label} htmlFor={`cat-${tx.id}`}>
            Categoria
          </label>
          <select
            id={`cat-${tx.id}`}
            name="category_id"
            key={kind}
            defaultValue={
              visibles.some((c) => c.id === tx.category?.id) ? (tx.category?.id ?? "") : ""
            }
            className={field}
          >
            <option value="">Sin categoria</option>
            {visibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {cuenta?.is_liability ? (
          <div>
            <label className={label} htmlFor={`card-${tx.id}`}>
              Plastico
            </label>
            <input
              id={`card-${tx.id}`}
              name="card_last4"
              inputMode="numeric"
              maxLength={4}
              defaultValue={tx.card_last4 ?? ""}
              placeholder="1234"
              className={`${field} tabular`}
            />
          </div>
        ) : null}
      </div>

      {/* Apagado por defecto: corregir la categoria de UN movimiento no siempre
          quiere decir que el comercio entero este mal clasificado. */}
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" name="learn" className="mt-0.5 accent-current" />
        <span>
          Aplicar esta categoria a este comercio de ahora en mas. Escribe una
          regla, asi el proximo resumen lo mapea solo.
        </span>
      </label>

      {state.error ? (
        <p className="rounded-md border border-negative/40 bg-negative/10 px-2 py-1.5 text-xs text-negative">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <SubmitButton>Guardar</SubmitButton>
        <button
          type="button"
          onClick={cerrar}
          className="rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:text-foreground"
        >
          Cancelar
        </button>
        {tx.fingerprint ? (
          <span className="ml-auto text-right text-[11px] leading-tight text-muted">
            Vino de un resumen. Si cambias monto, fecha, descripcion o cuenta,
            deja de coincidir con esa linea del PDF.
          </span>
        ) : null}
      </div>
    </form>
  );
}
