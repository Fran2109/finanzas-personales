"use client";

import { useActionState } from "react";
import { uploadStatement } from "@/app/import-actions";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/app/actions";
import type { Account } from "@/lib/data";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-xs font-medium uppercase tracking-wide text-muted mb-1.5";

export function UploadStatementForm({ accounts }: { accounts: Account[] }) {
  const [state, action] = useActionState<FormState, FormData>(uploadStatement, {});

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted">
        Primero crea una cuenta de tarjeta en{" "}
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
        <label className={label} htmlFor="account_id">
          Cuenta
        </label>
        <select id="account_id" name="account_id" className={field}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={label} htmlFor="file">
          PDF del resumen
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf"
          required
          className={`${field} file:mr-3 file:rounded file:border-0 file:bg-border file:px-2 file:py-1 file:text-xs file:text-foreground`}
        />
      </div>

      {state.error ? (
        <pre className="whitespace-pre-wrap rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </pre>
      ) : null}

      <SubmitButton pendingLabel="Leyendo el PDF...">Subir y reconciliar</SubmitButton>

      <p className="text-xs leading-relaxed text-muted">
        La suma de las filas tiene que dar el total declarado del resumen, al
        centavo y en cada moneda. Si no cierra, no se importa nada.
      </p>
    </form>
  );
}
