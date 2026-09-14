"use client";

import { useActionState } from "react";
import { createCategory, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-xs font-medium uppercase tracking-wide text-muted mb-1.5";

export function CategoryForm() {
  const [state, action] = useActionState<FormState, FormData>(createCategory, {});

  return (
    <form action={action} className="space-y-3" key={state.ok}>
      <div>
        <label className={label} htmlFor="cat-name">
          Nombre
        </label>
        <input id="cat-name" name="name" required autoComplete="off" placeholder="Seguros" className={field} />
      </div>
      <div>
        <label className={label} htmlFor="cat-kind">
          Tipo
        </label>
        <select id="cat-kind" name="kind" defaultValue="expense" className={field}>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
          <option value="tax_fee">Impuesto o comision</option>
          <option value="financing">Costo financiero</option>
          <option value="transfer">Transferencia</option>
        </select>
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

      <SubmitButton>Crear categoria</SubmitButton>
    </form>
  );
}
