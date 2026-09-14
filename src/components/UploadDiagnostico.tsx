"use client";

import { Amount } from "@/components/Amount";
import type { UploadState } from "@/app/import-actions";
import { KIND_LABELS, type Kind } from "@/lib/domain";
import { formatCents } from "@/lib/money";

/**
 * Que leyo el lector, cuando no cierra.
 *
 * El gate rechaza el import entero a proposito, pero "difieren 22,88" sin mas
 * deja a la persona con un PDF y una calculadora. Aca se ve fila por fila: casi
 * siempre el problema es un monto leido en la columna equivocada, y salta a la
 * vista comparando con el PDF.
 */
export function UploadDiagnostico({ d }: { d: NonNullable<UploadState["diagnostico"]> }) {
  return (
    <div className="space-y-4 rounded-lg border border-negative/40 bg-negative/5 p-3">
      <div>
        <h3 className="text-sm font-semibold text-negative">
          No reconcilia, asi que no se importo nada
        </h3>
        <p className="mt-1 text-xs text-muted">
          {[d.brand, d.periodClose ? `cierre ${d.periodClose}` : null, `${d.rows.length} filas leidas`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {d.currencies.map((c) => (
          <div
            key={c.currency}
            className={`rounded-md border px-3 py-2 text-xs ${
              c.ok ? "border-border" : "border-negative/50"
            }`}
          >
            <div className="mb-1 font-medium">{c.currency}</div>
            <Linea etiqueta="Saldo anterior" cents={c.previousBalance} currency={c.currency} />
            <Linea etiqueta="Suma de las filas" cents={c.rowsSum} currency={c.currency} />
            <Linea etiqueta="Computado" cents={c.computed} currency={c.currency} />
            <Linea etiqueta="Declarado" cents={c.declared} currency={c.currency} />
            <div
              className={`mt-1 border-t border-border pt-1 font-medium ${
                c.ok ? "text-positive" : "text-negative"
              }`}
            >
              {c.ok ? "Cierra" : `Difiere ${formatCents(c.difference, c.currency)}`}
            </div>
          </div>
        ))}
      </div>

      {d.unparsedLines.length > 0 ? (
        <div>
          <h4 className="mb-1 text-xs font-medium text-negative">
            Lineas que no se pudieron leer ({d.unparsedLines.length})
          </h4>
          <ul className="space-y-1">
            {d.unparsedLines.map((l, i) => (
              <li key={i} className="rounded bg-background px-2 py-1 font-mono text-xs">
                {l}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h4 className="mb-1 text-xs font-medium">Lo que leyo, fila por fila</h4>
        <p className="mb-2 text-xs text-muted">
          Compara con el PDF: si una diferencia aparece igual y opuesta en las
          dos monedas, hay un monto leido en la columna equivocada.
        </p>
        <div className="max-h-96 overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface text-muted">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">#</th>
                <th className="px-2 py-1.5 text-left font-medium">Fecha</th>
                <th className="px-2 py-1.5 text-left font-medium">Descripcion</th>
                <th className="px-2 py-1.5 text-right font-medium">Monto</th>
                <th className="px-2 py-1.5 text-left font-medium">Mon.</th>
                <th className="px-2 py-1.5 text-left font-medium">Leido como</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.lineNo} className="border-t border-border">
                  <td className="tabular px-2 py-1 text-muted">{r.lineNo}</td>
                  <td className="tabular px-2 py-1 whitespace-nowrap">{r.occurredOn}</td>
                  <td className="px-2 py-1">
                    {r.description}
                    {r.cuota ? <span className="ml-1 text-muted">cuota {r.cuota}</span> : null}
                    {r.cardLast4 ? <span className="ml-1 text-muted">*{r.cardLast4}</span> : null}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Amount cents={r.amount} currency={r.currency} />
                  </td>
                  <td
                    className={`px-2 py-1 font-medium ${
                      r.currency === "USD" ? "text-accent" : "text-muted"
                    }`}
                  >
                    {r.currency}
                  </td>
                  <td className="px-2 py-1 text-muted">
                    {KIND_LABELS[r.kind as Kind] ?? r.kind}
                    {!r.tracked ? " · no se importa" : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Linea({
  etiqueta,
  cents,
  currency,
}: {
  etiqueta: string;
  cents: number;
  currency: string;
}) {
  return (
    <div className="flex justify-between gap-3 text-muted">
      <span>{etiqueta}</span>
      <Amount cents={cents} currency={currency} />
    </div>
  );
}
