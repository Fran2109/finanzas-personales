"use client";

import { useActionState } from "react";

import { uploadPastedStatement, type UploadState } from "@/app/import-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { UploadDiagnostico } from "@/components/UploadDiagnostico";
import { periodOf, shiftPeriod, formatPeriod } from "@/lib/domain";
import type { Account } from "@/lib/data";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-xs font-medium uppercase tracking-wide text-muted mb-1.5";

/**
 * Cargar el mes en curso pegando la lista de consumos del home banking.
 *
 * El resumen todavia no cerro, asi que no hay PDF, pero los consumos ya estan a
 * la vista. Lo que entra por aca queda marcado como provisorio y lo reemplaza
 * el PDF cuando llegue.
 */
export function PasteStatementForm({ accounts }: { accounts: Account[] }) {
  const [state, action] = useActionState<UploadState, FormData>(uploadPastedStatement, {});

  const hoy = periodOf(new Date());
  const periodos = [shiftPeriod(hoy, 1), hoy, shiftPeriod(hoy, -1), shiftPeriod(hoy, -2)];

  if (accounts.length === 0) return null;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className={label} htmlFor="paste_account_id">
              Cuenta
            </label>
            <select id="paste_account_id" name="account_id" className={field} defaultValue="">
              {/* La lista del home banking no dice de que banco es, pero si
                  trae el plastico: si esa tarjeta ya se importo alguna vez,
                  alcanza para saber la cuenta. */}
              <option value="">Inferir por el plastico</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-40 flex-1">
            <label className={label} htmlFor="periodo">
              Mes del resumen
            </label>
            <select id="periodo" name="periodo" className={field} defaultValue={hoy}>
              {periodos.map((p) => (
                <option key={p} value={p}>
                  {formatPeriod(p)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="texto">
            Lista de consumos
          </label>
          <textarea
            id="texto"
            name="texto"
            required
            rows={8}
            placeholder={"Fecha\tTarjeta\tDescripcion\tCuotas\tImporte en pesos\n...\nTotal\t$ 0,00"}
            className={`${field} font-mono text-xs`}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Copia la tabla entera del home banking, <strong>con la fila Total
            incluida</strong>: es contra ese número que se verifica que no falte
            ninguna línea. El pago de la tarjeta puede venir en la lista, se
            ignora solo.
          </p>
        </div>

        <SubmitButton pendingLabel="Leyendo...">Cargar como provisorio</SubmitButton>
      </form>

      {state.error && !state.diagnostico ? (
        <p className="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      ) : null}

      {state.diagnostico ? <UploadDiagnostico d={state.diagnostico} /> : null}
    </div>
  );
}
