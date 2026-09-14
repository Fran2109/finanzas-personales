import { normalizeMerchant } from "../domain.ts";
import type { ParsedRow } from "./types.ts";

export type Rule = { id: string; pattern: string; category_id: string };

/**
 * Categorizacion en dos niveles, primer nivel.
 *
 * `merchant_rules` es un match deterministico por substring sobre la
 * descripcion normalizada: cero latencia y cero costo. Lo que no matchea queda
 * para la pantalla de revision, y cada correccion escribe una regla nueva, asi
 * el sistema se va callando con el tiempo.
 *
 * No mira el kind: los dos tipos de gasto comparten las mismas categorias, y
 * un comercio es el mismo comercio se pague al contado o en cuotas.
 */
export function suggestCategory(row: ParsedRow, rules: Rule[]): string | null {
  const haystack = normalizeMerchant(row.rawDescription);
  // La regla mas larga gana: la mas especifica le gana a la generica cuando las
  // dos matchean la misma descripcion.
  const matches = rules
    .filter((r) => r.pattern && haystack.includes(normalizeMerchant(r.pattern)))
    .sort((a, b) => b.pattern.length - a.pattern.length);

  return matches[0]?.category_id ?? null;
}

/**
 * Patron propuesto para la regla nueva cuando el usuario categoriza a mano.
 *
 * Se queda con las primeras palabras significativas y descarta la cola de
 * numeros de operacion, que cambia todos los meses y haria que la regla no
 * vuelva a matchear nunca.
 */
export function suggestPattern(rawDescription: string): string {
  const words = normalizeMerchant(rawDescription)
    .split(" ")
    .filter((w) => w && !/^\d+$/.test(w) && !/\d{4,}/.test(w));
  return words.slice(0, 2).join(" ") || normalizeMerchant(rawDescription).slice(0, 20);
}
