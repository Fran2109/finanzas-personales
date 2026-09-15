"use client";

import { useState } from "react";
import { deleteImport } from "@/app/import-actions";
import { botonBorde } from "@/components/ui/estilos";

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
        className="-my-1.5 shrink-0 py-1.5 text-sm text-muted transition hover:text-negative"
      >
        {label}
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">
        {transactionCount > 0
          ? `¿Borrar el resumen y sus ${transactionCount} movimientos?`
          : "¿Borrar el resumen?"}
      </span>
      <form action={deleteImport}>
        <input type="hidden" name="import_id" value={importId} />
        <button
          type="submit"
          className={botonBorde("peligro")}
        >
          Si, borrar
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="-my-1.5 py-1.5 text-muted transition hover:text-foreground"
      >
        Cancelar
      </button>
    </span>
  );
}
