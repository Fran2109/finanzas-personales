"use client";

import { useEffect } from "react";

/**
 * Una consulta que falla no tiene por que dejar la pantalla en blanco. Casi
 * siempre es un corte transitorio contra la base, y reintentar alcanza.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <h1 className="text-lg font-semibold">No se pudo cargar</h1>
      <p className="mt-2 text-sm text-muted">
        {error.message || "Algo fallo del lado del servidor."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-background"
      >
        Reintentar
      </button>
      {error.digest ? (
        <p className="tabular mt-4 text-xs text-muted">Error {error.digest}</p>
      ) : null}
    </div>
  );
}
