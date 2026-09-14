"use client";

import { useActionState } from "react";
import { changePassword, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-xs font-medium uppercase tracking-wide text-muted mb-1.5";

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePassword, {});

  return (
    <form action={action} className="max-w-sm space-y-3" key={state.ok}>
      <div>
        <label className={label} htmlFor="password">
          Nueva contrasena
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={field}
        />
      </div>
      <div>
        <label className={label} htmlFor="confirm">
          Repetir
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={field}
        />
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

      <SubmitButton>Cambiar contrasena</SubmitButton>
    </form>
  );
}
