"use client";

import { useActionState } from "react";

import { uploadStatement, type UploadState } from "@/app/import-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { UploadDiagnostico } from "@/components/UploadDiagnostico";
import type { Account } from "@/lib/data";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-xs font-medium uppercase tracking-wide text-muted mb-1.5";

export function UploadStatementForm({ accounts }: { accounts: Account[] }) {
  const [state, action] = useActionState<UploadState, FormData>(uploadStatement, {});

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
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label className={label} htmlFor="account_id">
            Cuenta
          </label>
          {/* Por defecto se infiere del propio resumen: el banco, la marca y
              los plasticos ya alcanzan para saber cual es. Elegir una a mano es
              el override, y despues se puede cambiar en la revision. */}
          <select id="account_id" name="account_id" className={field} defaultValue="">
            <option value="">Inferir del resumen</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-64 flex-[2]">
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

        <SubmitButton pendingLabel="Leyendo el PDF...">Subir y reconciliar</SubmitButton>
      </form>

      {state.error && !state.diagnostico ? (
        <p className="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      ) : null}

      {state.diagnostico ? <UploadDiagnostico d={state.diagnostico} /> : null}

      {!state.error ? (
        <p className="text-xs leading-relaxed text-muted">
          La suma de las filas tiene que dar el total declarado del resumen, al
          centavo y en cada moneda. Si no cierra, no se importa nada. La cuenta
          se deduce del resumen y se puede corregir antes de confirmar.
        </p>
      ) : null}
    </div>
  );
}
