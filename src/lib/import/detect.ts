import { parseGaliciaStatement } from "./galicia.ts";
import { parseSupervielleStatement } from "./supervielle.ts";
import type { ParsedStatement } from "./types.ts";

export type Bank = "galicia" | "supervielle";

/**
 * Que banco emitio el resumen.
 *
 * Se reconoce por la estructura, no por el nombre del banco: el nombre puede
 * aparecer en la letra chica de cualquier resumen, mientras que como se llaman
 * los totales es lo que de verdad decide como leerlo.
 */
export function detectBank(text: string): Bank | null {
  if (/^\s*SALDO ACTUAL\b/im.test(text) && /FECHA CIERRE ACTUAL/i.test(text)) {
    return "supervielle";
  }
  if (/^\s*TOTAL A PAGAR\b/im.test(text) && /^\s*CONSOLIDADO\b/im.test(text)) {
    return "galicia";
  }
  return null;
}

const PARSERS: Record<Bank, (text: string) => ParsedStatement> = {
  galicia: parseGaliciaStatement,
  supervielle: parseSupervielleStatement,
};

export const BANK_LABELS: Record<Bank, string> = {
  galicia: "Galicia",
  supervielle: "Supervielle",
};

/** Lee el resumen con el lector del banco que lo emitio. */
export function parseStatement(text: string): { bank: Bank; statement: ParsedStatement } | null {
  const bank = detectBank(text);
  if (!bank) return null;
  return { bank, statement: PARSERS[bank](text) };
}
