"use client";

import { useEffect } from "react";

/**
 * Una consulta que falla no tiene por que dejar la pantalla en blanco. Casi
 * siempre es un corte transitorio contra la base, y reintentar alcanza.
 *
 * **No se muestra `error.message`.** React borra el mensaje de un error de
 * Server Component antes de mandarlo al navegador, para no filtrar detalles del
 * servidor, y en su lugar deja un texto propio: "Minified React error #441...".
 * Mostrarlo era peor que no mostrar nada, porque ocupaba el lugar de la
 * explicacion con algo que no le dice nada a nadie. Lo unico que sobrevive al
 * cliente es el `digest`, que es justamente con lo que se encuentra el error de
 * verdad en los logs del servidor.
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
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Falló la consulta contra la base. Casi siempre es pasajero —un corte de
        red, o el reloj del servidor corriendo unos segundos adelantado—, así
        que reintentar suele alcanzar.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-background"
      >
        Reintentar
      </button>
      {error.digest ? (
        <p className="tabular mt-4 text-xs leading-relaxed text-muted">
          Error {error.digest}
          <span className="block">Con ese número se encuentra la causa en los logs.</span>
        </p>
      ) : null}
    </div>
  );
}
