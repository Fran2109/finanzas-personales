import Link from "next/link";

import { DeleteImportButton } from "@/components/DeleteImportButton";
import { centsFromDb, formatCents } from "@/lib/money";
import { insignia } from "@/components/ui/estilos";

const STATUS_LABELS: Record<string, string> = {
  pending: "Sin reconciliar",
  reconciled: "Listo para revisar",
  rejected: "Rechazado",
  committed: "Importado",
};

export type ImportedStatement = {
  id: string;
  filename: string;
  period_close: string | null;
  status: string;
  provisional: boolean;
  declared_total_ars: number;
  declared_total_usd: number;
  account: { name: string } | null;
};

/**
 * Un resumen en el listado de importados.
 *
 * Separado de la pagina por lo mismo que `MesView`: el banco de pruebas
 * necesita la fila de verdad. Mientras vivio adentro de la pagina, el banco
 * renderizaba de esta pantalla solo los dos formularios, asi que la auditoria
 * responsive nunca la midio.
 */
export function StatementRow({
  imp,
  movimientos,
}: {
  imp: ImportedStatement;
  /** Cuantos movimientos dejo: es lo que se pierde al borrarlo. */
  movimientos: number;
}) {
  const usd = centsFromDb(imp.declared_total_usd);

  return (
    <li className="flex items-center gap-3 px-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        {/* El padding vertical con el margen negativo que lo compensa: el
            link medía 22px de alto —por debajo del piso para el dedo— y es el
            unico modo de abrir un resumen. El area crece, la linea no se mueve. */}
        <Link
          href={`/importar/${imp.id}`}
          className="-my-1.5 block truncate py-1.5 hover:underline"
        >
          {imp.filename}
        </Link>
        {/* La insignia va en la linea de metadatos y primero, no pegada al
            nombre: el nombre trunca, asi que colgada atras caia sola a la linea
            de abajo en un telefono y su `ml-2` no significaba nada. */}
        <div className="flex items-center gap-2 text-xs text-muted">
          {imp.provisional ? <span className={insignia}>provisorio</span> : null}
          <span className="min-w-0 truncate">
            {[
              imp.account?.name,
              imp.period_close,
              STATUS_LABELS[imp.status] ?? imp.status,
              movimientos > 0 ? `${movimientos} movimientos` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      </div>

      <span className="tabular shrink-0 text-right">
        <span className="block">{formatCents(centsFromDb(imp.declared_total_ars))}</span>
        {/* Sin fx_rates cargadas no hay cotizacion honesta: los dolares se
            muestran aparte, nunca pesificados. */}
        {usd !== 0 ? (
          <span className="block text-xs text-muted">{formatCents(usd, "USD")}</span>
        ) : null}
      </span>

      <DeleteImportButton importId={imp.id} transactionCount={movimientos} />
    </li>
  );
}
