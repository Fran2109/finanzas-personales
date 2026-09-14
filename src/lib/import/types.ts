import type { Cents } from "../money.ts";
import type { Currency, Kind } from "../domain.ts";

/** Una linea del resumen, ya transcripta pero todavia sin categorizar. */
export type ParsedRow = {
  lineNo: number;
  occurredOn: string;
  rawDescription: string;
  amount: Cents;
  currency: Currency;
  kind: Kind;
  cardLast4: string | null;
  cuotaCurrent: number | null;
  cuotaTotal: number | null;
  /**
   * Si la linea es algo que la app registra.
   *
   * Falso para lo que el resumen trae pero no es un gasto: el pago, las
   * transferencias, las devoluciones de percepcion. Se transcriben igual
   * porque la reconciliacion las necesita, pero no se importan.
   */
  tracked: boolean;
};

/** Subtotal declarado por plastico. Sirve de control cruzado independiente. */
export type CardSubtotal = {
  cardLast4: string;
  declaredArs: Cents;
  declaredUsd: Cents;
};

export type ParsedStatement = {
  /** "VISA", "MASTERCARD GOLD". Sale de la cabecera del resumen. */
  brand: string | null;
  statementId: string | null;
  periodClose: string | null;
  previousBalanceArs: Cents;
  previousBalanceUsd: Cents;
  declaredTotalArs: Cents;
  declaredTotalUsd: Cents;
  rows: ParsedRow[];
  cardSubtotals: CardSubtotal[];
  /** Lineas con fecha que el parser no supo leer. Si hay alguna, no se confia. */
  unparsedLines: string[];
};
