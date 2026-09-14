"use client";

import { useActionState, useState } from "react";

import { deleteAccount, setAccountActive, updateAccount, type FormState } from "@/app/actions";
import { Amount } from "@/components/Amount";
import { SubmitButton } from "@/components/SubmitButton";
import type { AccountBalance } from "@/lib/data";

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: "Banco",
  cash: "Efectivo",
  credit_card: "Tarjeta de credito",
  investment: "Inversion",
};

const field =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

/**
 * Fila de cuenta con edicion en linea.
 *
 * El editor no se cierra solo desde un efecto: la pagina le pasa una `key`
 * derivada de los datos de la cuenta, asi que cuando el guardado cambia algo
 * la fila se remonta y vuelve sola al modo lectura. Si no cambio nada, el
 * editor queda abierto con el mensaje de guardado, que es lo que corresponde.
 */
export function AccountRow({
  account,
  importCount,
}: {
  account: AccountBalance;
  importCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(updateAccount, {});

  const tieneMovimientos = account.movements > 0;

  if (editing) {
    return (
      <li className="px-3 py-3">
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={account.id} />
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem_6rem]">
            <input
              name="name"
              defaultValue={account.name}
              required
              autoFocus
              className={field}
              aria-label="Nombre"
            />
            <select
              name="type"
              defaultValue={account.type}
              className={field}
              aria-label="Tipo"
            >
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              name="currency"
              defaultValue={account.currency}
              className={field}
              aria-label="Moneda"
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
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

          <div className="flex items-center gap-3">
            <SubmitButton className="px-3 py-1.5 text-xs">Guardar</SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancelar
            </button>
            {tieneMovimientos ? (
              <span className="ml-auto text-xs text-muted">
                Cambiar la moneda no toca los movimientos ya cargados: cada uno
                guarda la suya.
              </span>
            ) : null}
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className={account.active ? "" : "text-muted line-through"}>
          {account.name}
        </div>
        <div className="text-xs text-muted">
          {[
            ACCOUNT_TYPE_LABELS[account.type] ?? account.type,
            account.currency,
            `${account.movements} movimientos`,
            importCount > 0 ? `${importCount} resumenes` : null,
            account.active ? null : "archivada",
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      <Amount cents={account.balance} currency={account.currency} tone="auto" />

      {confirming ? (
        <span className="flex items-center gap-2 text-xs">
          <span className="text-muted">
            {importCount > 0
              ? `¿Borrar la cuenta y sus ${importCount} resumenes?`
              : "¿Borrar la cuenta?"}
          </span>
          <form action={deleteAccount}>
            <input type="hidden" name="id" value={account.id} />
            <button
              type="submit"
              className="rounded border border-negative/50 px-2 py-1 text-negative hover:bg-negative/10"
            >
              Si, borrar
            </button>
          </form>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-muted hover:text-foreground"
          >
            Cancelar
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted transition hover:text-foreground"
          >
            Editar
          </button>
          <form action={setAccountActive}>
            <input type="hidden" name="id" value={account.id} />
            <input type="hidden" name="active" value={String(!account.active)} />
            <button type="submit" className="text-muted transition hover:text-foreground">
              {account.active ? "Archivar" : "Reactivar"}
            </button>
          </form>
          {tieneMovimientos ? (
            <span
              className="cursor-not-allowed text-muted/50"
              title="Tiene movimientos. Archivala en vez de borrarla."
            >
              Borrar
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-muted transition hover:text-negative"
            >
              Borrar
            </button>
          )}
        </span>
      )}
    </li>
  );
}
