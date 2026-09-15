/**
 * Cuanto falta para que un token recien emitido sea valido.
 *
 * Supabase Auth firma el access token con el `iat` de SU reloj, y PostgREST lo
 * valida contra el suyo. Si el de Auth va unos segundos adelantado, el token
 * nace invalido: PostgREST responde `JWT issued at future` a todo lo que salga
 * durante esa ventana, y como el token dura una hora, el sintoma aparece justo
 * despues de un refresh y despues no vuelve por un rato. Eso es lo que hace que
 * el error se vea "a veces" y no se pueda reproducir.
 *
 * Esperar es lo unico que lo arregla —pedir otro token traeria un `iat` mas
 * adelantado todavia— pero cuanto esperar no hay que adivinarlo: el token lo
 * dice. Se lee el `iat` y se espera exactamente eso.
 *
 * El payload se decodifica sin verificar la firma, y esta bien: no se le cree
 * nada al token, solo se mira un numero para saber cuanto dormir. Si viene
 * corrupto, el resultado es 0 y la consulta sale igual a fallar como antes.
 */

/**
 * PostgREST rechaza con `iat > now`, asi que llegar al milisegundo justo deja
 * la decision del lado del redondeo. Un pelin despues y no hay empate.
 */
const MARGEN_MS = 250;

/**
 * Tope de la espera. Un desfasaje de un par de segundos es un problema de
 * relojes y se aguanta; uno de medio minuto es otra cosa, y dormir treinta
 * segundos para despues fallar igual es peor que fallar rapido y decirlo.
 */
export const TOPE_ESPERA_MS = 3000;

/** El `iat` del token en ms, o null si no se puede leer. */
export function issuedAtMs(accessToken: string): number | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const iat = (JSON.parse(json) as { iat?: unknown }).iat;
    return typeof iat === "number" && Number.isFinite(iat) ? iat * 1000 : null;
  } catch {
    // Un token que no se puede leer no es asunto de este modulo: el error real
    // lo va a dar la consulta, con su mensaje, que dice mas que uno inventado.
    return null;
  }
}

/** Cuanto dormir para que el token ya sea valido. 0 si no hace falta. */
export function msUntilValid(accessToken: string, now = Date.now()): number {
  const iat = issuedAtMs(accessToken);
  if (iat === null) return 0;
  const falta = iat + MARGEN_MS - now;
  if (falta <= 0) return 0;
  return Math.min(falta, TOPE_ESPERA_MS);
}
