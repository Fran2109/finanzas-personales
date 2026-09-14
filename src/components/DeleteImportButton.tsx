"use client";

import { useState } from "react";
import { deleteImport } from "@/app/import-actions";

/**
 * Borrar un resumen ya importado se lleva puestos sus movimientos, y no hay
 * vuelta atras. Por eso el boton dice cuantos son antes de pedir confirmacion.
 */
export function DeleteImportButton({
  importId,
  transactionCount,
  label = "Borrar",
}: {
  importId: string;
  transactionCount: number;
  label?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-muted transition hover:text-negative"
      >
        {label}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-muted">
        {transactionCount > 0
          ? `¿Borrar el resumen y sus ${transactionCount} movimientos?`
          : "¿Borrar el resumen?"}
      </span>
      <form action={deleteImport}>
        <input type="hidden" name="import_id" value={importId} />
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
  );
}
