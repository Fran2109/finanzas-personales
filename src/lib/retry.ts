/**
 * Reintento para fallas transitorias contra Supabase.
 *
 * Las funciones corren en `gru1` (San Pablo) y la base esta en sa-east-1, asi
 * que la consulta no cruza el continente como decia antes este comentario: la
 * API de Vercel dice `regions: ["gru1"]`. Igual una instancia que estuvo ociosa
 * puede tardar lo suficiente como para que el gateway corte con un 504, y eso
 * es transitorio: no tiene por que llegar a la pantalla.
 *
 * Solo se reintenta lo que puede andar bien en el proximo intento. Un error de
 * permisos o una consulta mal formada fallan igual siempre: reintentarlos solo
 * agrega latencia antes del mismo error.
 *
 * "issued at future" entra en la lista porque es desfasaje de reloj: el token se
 * emite con una marca de tiempo apenas adelantada respecto del que lo valida, y
 * unos milisegundos despues ya es valido. Un token vencido o mal firmado NO
 * entra: esos no se arreglan esperando.
 */
const TRANSIENT =
  /gateway timeout|timeout|timed out|fetch failed|socket hang up|econnreset|network|503|504|temporarily unavailable|issued at future|not yet valid/i;

/**
 * Desfasaje de reloj, que se reintenta distinto que el resto.
 *
 * Un 504 se arregla reintentando ya mismo. Este no: el token vale recien cuando
 * el reloj del que lo valida alcanza al `iat`, y eso se mide en segundos.
 * Reintentar a los 150ms garantiza exactamente el mismo error tres veces.
 *
 * Pedir un token nuevo tampoco sirve, al contrario: vendria con un `iat` mas
 * adelantado todavia. Lo unico que lo arregla es esperar.
 */
const CLOCK_SKEW = /issued at future|not yet valid/i;

/**
 * Y se reintenta mas veces, porque **aca es donde se arregla de verdad**.
 *
 * El proxy tambien espera, leyendo el `iat` del token, pero mide contra el
 * reloj de Vercel y el que rechaza es PostgREST: si el desfasaje esta entre
 * Supabase Auth y PostgREST, desde Vercel el token ya parece valido y el proxy
 * no espera nada. Por eso esto existe aparte.
 *
 * **Y durante un tiempo no corrio ni una vez.** La evidencia que decia este
 * comentario —un 500 sin una sola linea de `[clock-skew]` en los logs— se leyo
 * como que el proxy no habia esperado, y era la mitad de la historia: la otra
 * mitad es que `isTransient` descartaba el error por su codigo `PGRST` antes de
 * mirar el mensaje. O sea que el silencio en los logs no probaba la teoria del
 * proxy, probaba que el reintento no se estaba ejecutando. Cuando la unica
 * prueba de que algo anda es que **no** aparece un log, conviene verificar que
 * ese log pueda aparecer.
 *
 * El reintento no necesita saber de que reloj es el problema: reacciona al
 * rechazo, que es la unica evidencia que hay de cuando el token empezo a
 * valer. 1s + 2s + 4s cubre siete segundos de desfasaje, y el tope esta para
 * que una pagina no cuelgue si el problema es mas grande que un redondeo.
 */
const CLOCK_SKEW_ATTEMPTS = 4;

export function isTransient(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;

  // **El desfasaje se pregunta antes que el codigo, y ese orden es el arreglo.**
  //
  // PostgREST rechaza un JWT con `PGRST301` o `PGRST303` —los dos 401— y la
  // guarda de abajo descarta todo lo que empiece con `PGRST` sin mirar el
  // mensaje. O sea que el desfasaje entraba por la puerta que lo dejaba afuera:
  // el reintento no corria nunca, y como tampoco llegaba a agotarse, ni
  // siquiera quedaba la linea de `[clock-skew]` que lo habria delatado. Un 500
  // en pantalla y cero rastro en los logs.
  //
  // Es el unico error con codigo de PostgREST que el proximo intento puede
  // resolver, porque no depende de la consulta sino de la hora. Un token
  // vencido o mal firmado llega con el mismo codigo y sigue cayendo en la
  // guarda: esos no se arreglan esperando.
  if (CLOCK_SKEW.test(error.message ?? "")) return true;

  if (error.code && /^(PGRST|22|23|42)/.test(error.code)) return false;
  return TRANSIENT.test(error.message ?? "");
}

/** Cuanto esperar antes del proximo intento, segun que fallo. */
export function retryDelayMs(
  error: { message?: string } | null,
  attempt: number,
  baseDelayMs: number,
): number {
  const base = CLOCK_SKEW.test(error?.message ?? "") ? 1000 : baseDelayMs;
  return base * 2 ** attempt;
}

export type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

/**
 * El error, con su codigo, para el mensaje que termina en los logs.
 *
 * Existe porque su ausencia costo caro. Los `throw` de `data.ts` interpolaban
 * solo `error.message`, asi que en produccion se leia `JWT issued at future` y
 * nada mas — y el codigo era justamente el dato que explicaba por que el
 * reintento no lo agarraba. Diagnosticarlo pidio leer el codigo fuente y la
 * documentacion de PostgREST para adivinar que codigo venia. Con el codigo a
 * la vista se contestaba solo.
 */
export function describeError(error: { message: string; code?: string }): string {
  return error.code ? `${error.message} [${error.code}]` : error.message;
}

/**
 * Corre la consulta y la reintenta con backoff mientras el error parezca
 * transitorio. `attempts` cuenta el intento inicial.
 */
export async function withRetry<T>(
  run: () => PromiseLike<Result<T>>,
  { attempts = 3, baseDelayMs = 150 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<Result<T>> {
  let last: Result<T> = { data: null, error: { message: "sin intentos" } };
  let esperado = 0;

  for (let attempt = 0; ; attempt++) {
    try {
      last = await run();
    } catch (thrown) {
      // Una falla de red corta antes de devolver {data, error}.
      last = {
        data: null,
        error: { message: thrown instanceof Error ? thrown.message : String(thrown) },
      };
    }

    if (!last.error || !isTransient(last.error)) return last;

    // El desfasaje de reloj tiene su propio presupuesto: es el unico error de
    // esta lista que no se arregla reintentando rapido, sino esperando.
    const esSkew = CLOCK_SKEW.test(last.error.message ?? "");
    const tope = esSkew ? Math.max(attempts, CLOCK_SKEW_ATTEMPTS) : attempts;
    if (attempt >= tope - 1) {
      if (esSkew) {
        // Que quede el numero: si pasa seguido con esta espera, el desfasaje es
        // mas grande que un redondeo de relojes y hay que mirar el proyecto, no
        // seguir subiendo el tope.
        console.warn(
          `[clock-skew] el token seguia sin valer despues de ${esperado}ms en ${tope} intentos`,
        );
      }
      return last;
    }

    const espera = retryDelayMs(last.error, attempt, baseDelayMs);
    esperado += espera;
    await new Promise((resolve) => setTimeout(resolve, espera));
  }
}
