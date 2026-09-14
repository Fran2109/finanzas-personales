/**
 * El gate de reconciliacion.
 *
 * La suma de las filas extraidas tiene que igualar el total declarado, al
 * centavo, en cada moneda por separado. Si no cierra, el import se rechaza
 * entero y no se escribe nada.
 *
 * Esto existe porque un lector de PDF puede saltear una fila en silencio. Sin
 * el gate, eso es corrupcion silenciosa de los datos; con el gate, es una falla
 * ruidosa que se ve y se arregla.
 */
import type { Cents } from "../money.ts";
import type { Currency } from "../domain.ts";
import type { ParsedStatement } from "./types.ts";

export type CurrencyCheck = {
  currency: Currency;
  previousBalance: Cents;
  rowsSum: Cents;
  computed: Cents;
  declared: Cents;
  difference: Cents;
  ok: boolean;
};

export type CardCheck = {
  cardLast4: string;
  currency: Currency;
  computed: Cents;
  declared: Cents;
  ok: boolean;
};

/** Una fila tal como la leyo el parser, para poder mirarla cuando no cierra. */
export type DiagnosticRow = {
  lineNo: number;
  occurredOn: string;
  description: string;
  amount: Cents;
  currency: Currency;
  kind: string;
  tracked: boolean;
  cuota: string | null;
  cardLast4: string | null;
};

export type Reconciliation = {
  ok: boolean;
  currencies: CurrencyCheck[];
  cards: CardCheck[];
  unparsedLines: string[];
  /** Por que se rechaza, en castellano y listo para mostrar. */
  problems: string[];
};

const CURRENCIES: Currency[] = ["ARS", "USD"];

function sum(values: Cents[]): Cents {
  return values.reduce((total, v) => total + v, 0);
}

export function reconcile(statement: ParsedStatement): Reconciliation {
  const problems: string[] = [];

  const currencies: CurrencyCheck[] = CURRENCIES.map((currency) => {
    const previousBalance =
      currency === "ARS" ? statement.previousBalanceArs : statement.previousBalanceUsd;
    const declared =
      currency === "ARS" ? statement.declaredTotalArs : statement.declaredTotalUsd;
    const rowsSum = sum(
      statement.rows.filter((r) => r.currency === currency).map((r) => r.amount),
    );
    const computed = previousBalance + rowsSum;
    const difference = computed - declared;

    return {
      currency,
      previousBalance,
      rowsSum,
      computed,
      declared,
      difference,
      ok: difference === 0,
    };
  });

  for (const check of currencies) {
    if (!check.ok) {
      problems.push(
        `En ${check.currency} la suma de las filas no da el total declarado: ` +
          `difieren ${(check.difference / 100).toFixed(2)}.`,
      );
    }
  }

  // Control cruzado independiente: cada plastico contra su propio subtotal.
  const cards: CardCheck[] = [];
  for (const subtotal of statement.cardSubtotals) {
    for (const currency of CURRENCIES) {
      const computed = sum(
        statement.rows
          .filter((r) => r.cardLast4 === subtotal.cardLast4 && r.currency === currency)
          .map((r) => r.amount),
      );
      const declared =
        currency === "ARS" ? subtotal.declaredArs : subtotal.declaredUsd;
      const ok = computed === declared;
      cards.push({ cardLast4: subtotal.cardLast4, currency, computed, declared, ok });
      if (!ok) {
        problems.push(
          `La tarjeta ${subtotal.cardLast4} no cierra en ${currency}: ` +
            `sumo ${(computed / 100).toFixed(2)} y declara ${(declared / 100).toFixed(2)}.`,
        );
      }
    }
  }

  if (statement.unparsedLines.length > 0) {
    problems.push(
      `Hay ${statement.unparsedLines.length} linea(s) con fecha que no se pudieron leer.`,
    );
  }

  if (statement.rows.length === 0) {
    problems.push("No se encontro ningun movimiento. ¿Es un resumen de tarjeta Galicia?");
  }

  return {
    ok: problems.length === 0,
    currencies,
    cards,
    unparsedLines: statement.unparsedLines,
    problems,
  };
}

/**
 * La transcripcion completa, para mostrar cuando el resumen no cierra.
 *
 * Sin esto el gate dice "no reconcilia y difiere 22,88" y no hay forma de saber
 * que renglon lo causo sin volver a abrir el PDF y sumar a mano.
 */
export function diagnosticRows(statement: ParsedStatement): DiagnosticRow[] {
  return statement.rows.map((row) => ({
    lineNo: row.lineNo,
    occurredOn: row.occurredOn,
    description: row.rawDescription,
    amount: row.amount,
    currency: row.currency,
    kind: row.kind,
    tracked: row.tracked,
    cuota: row.cuotaCurrent ? `${row.cuotaCurrent}/${row.cuotaTotal ?? "?"}` : null,
    cardLast4: row.cardLast4,
  }));
}
