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
};

/** Subtotal declarado por plastico. Sirve de control cruzado independiente. */
export type CardSubtotal = {
  cardLast4: string;
  declaredArs: Cents;
  declaredUsd: Cents;
};

export type ParsedStatement = {
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
