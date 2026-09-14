/**
 * Reintento para fallas transitorias contra Supabase.
 *
 * La app corre en Vercel (iad1) y la base esta en sa-east-1: cada consulta
 * cruza el continente, y una instancia que estuvo ociosa puede tardar lo
 * suficiente como para que el gateway corte con un 504. Eso es transitorio y no
 * tiene por que llegar a la pantalla.
 *
 * Solo se reintenta lo que puede andar bien en el proximo intento. Un error de
 * permisos o una consulta mal formada fallan igual siempre: reintentarlos solo
 * agrega latencia antes del mismo error.
 */
const TRANSIENT = /gateway timeout|timeout|timed out|fetch failed|socket hang up|econnreset|network|503|504|temporarily unavailable/i;

export function isTransient(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code && /^(PGRST|22|23|42)/.test(error.code)) return false;
  return TRANSIENT.test(error.message ?? "");
}

export type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

/**
 * Corre la consulta y la reintenta con backoff mientras el error parezca
 * transitorio. `attempts` cuenta el intento inicial.
 */
export async function withRetry<T>(
  run: () => PromiseLike<Result<T>>,
  { attempts = 3, baseDelayMs = 150 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<Result<T>> {
  let last: Result<T> = { data: null, error: { message: "sin intentos" } };

  for (let attempt = 0; attempt < attempts; attempt++) {
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

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }

  return last;
}
