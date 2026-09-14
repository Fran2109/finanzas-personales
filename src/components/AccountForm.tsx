"use client";

import { useActionState } from "react";
import { createAccount, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-xs font-medium uppercase tracking-wide text-muted mb-1.5";

export function AccountForm() {
  const [state, action] = useActionState<FormState, FormData>(createAccount, {});

  return (
    <form action={action} className="space-y-3" key={state.ok}>
      <div>
        <label className={label} htmlFor="name">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          required
          autoComplete="off"
          placeholder="Galicia Caja de Ahorro"
          className={field}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="type">
            Tipo
          </label>
          <select id="type" name="type" defaultValue="bank" className={field}>
            <option value="bank">Banco</option>
            <option value="cash">Efectivo</option>
            <option value="credit_card">Tarjeta de credito</option>
            <option value="investment">Inversion</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="currency">
            Moneda
          </label>
          <select id="currency" name="currency" defaultValue="ARS" className={field}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
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

      <SubmitButton>Crear cuenta</SubmitButton>
    </form>
  );
}
