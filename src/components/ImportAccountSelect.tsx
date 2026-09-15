"use client";

import { useState } from "react";

import { setImportAccount } from "@/app/import-actions";
import type { Account } from "@/lib/data";
import { botonBorde, campoCompacto } from "@/components/ui/estilos";

/**
 * A que cuenta corresponde el resumen, corregible mientras siga en staging.
 *
 * El boton aparece recien al cambiar la eleccion: la cuenta inferida acierta
 * casi siempre, y un boton permanente al lado invita a tocar algo que ya esta
 * bien.
 */
export function ImportAccountSelect({
  importId,
  accounts,
  current,
}: {
  importId: string;
  accounts: Account[];
  current: string;
}) {
  const [value, setValue] = useState(current);

  return (
    <form action={setImportAccount} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-none">
      <input type="hidden" name="import_id" value={importId} />
      <select
        name="account_id"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Cuenta del resumen"
        className={`${campoCompacto} min-w-32 flex-1 sm:w-56 sm:flex-none`}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {value !== current ? (
        <button
          type="submit"
          className={botonBorde("acento")}
        >
          Cambiar
        </button>
      ) : null}
    </form>
  );
}
