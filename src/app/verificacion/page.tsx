/**
 * Banco de pruebas visual. No existe en produccion.
 *
 * Desde el contenedor no se llega a la base, asi que la unica forma de mirar
 * una pantalla renderizada es darle datos inventados. Lo importante es que
 * arma cada pantalla con sus **componentes reales**: una copia del markup se
 * desfasa del original y termina verificando algo que no existe. Ya paso.
 *
 * Se levanta con:
 *
 *   npm run build && VERIFICACION=1 npx next start -p 3210
 *   node scripts/responsive.mjs
 *
 * Sin `VERIFICACION=1` devuelve 404, asi que el deploy no lo expone aunque el
 * proxy lo deje pasar.
 */
import { notFound } from "next/navigation";

import { AccountForm } from "@/components/AccountForm";
import { AnalisisView } from "@/components/AnalisisView";
import { AccountRow } from "@/components/AccountRow";
import { Amount } from "@/components/Amount";
import { Aviso } from "@/components/ui/Aviso";
import { CategoryForm } from "@/components/CategoryForm";
import { LoginForm } from "@/components/LoginForm";
import { MesView } from "@/components/MesView";
import { PasswordForm } from "@/components/PasswordForm";
import { PasteStatementForm } from "@/components/PasteStatementForm";
import { DeleteImportButton } from "@/components/DeleteImportButton";
import { ImportAccountSelect } from "@/components/ImportAccountSelect";
import { ImportRowList } from "@/components/ImportRowList";
import { StatementRow } from "@/components/StatementRow";
import { UploadStatementForm } from "@/components/UploadStatementForm";
import {
  commitmentCalendar,
  committedShare,
  installmentFlow,
  openPlans,
  remainingByCategory,
  withCurrentMonth,
} from "@/lib/commitments";
import {
  cuentas,
  categorias,
  cuotas,
  filasDescartadas,
  filasImportadas,
  movimientos,
  resumenes,
  summary,
  MES,
} from "./datos";
import { botonAcento, botonIcono, gridDosColumnas, insignia, lista } from "@/components/ui/estilos";

/**
 * Sin esto Next la prerenderiza y evalua `process.env` en el build, cuando la
 * variable no existe: la pagina queda con el 404 horneado adentro y nunca se
 * muestra, prendas la variable que prendas al levantar el server.
 */
export const dynamic = "force-dynamic";

export const PANTALLAS = [
  "mes",
  "analisis",
  "cuentas",
  "ajustes",
  "importar",
  "revision",
  "login",
] as const;

export default async function Verificacion({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  if (process.env.VERIFICACION !== "1") notFound();
  const { p = "mes" } = await searchParams;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-sm font-semibold">Finanzas</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>Mes</span>
            <span>Análisis</span>
            <span>Importar</span>
            <span>Cuentas</span>
            <span>Ajustes</span>
          </nav>
          <span className="ml-auto text-sm text-muted">Salir</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {p === "mes" ? <Mes /> : null}
        {p === "analisis" ? <Analisis /> : null}
        {p === "cuentas" ? <Cuentas /> : null}
        {p === "ajustes" ? <Ajustes /> : null}
        {p === "importar" ? <Importar /> : null}
        {p === "revision" ? <Revision /> : null}
        {p === "login" ? <Login /> : null}
      </main>
    </div>
  );
}

function Mes() {
  return (
    <MesView
      period={MES}
      filters={{ q: "", cuenta: [], categoria: [], tipo: [], moneda: [] }}
      accounts={cuentas}
      categories={categorias}
      transactions={movimientos}
      totalSinFiltrar={movimientos.length + 3}
      summary={summary}
      currencies={["ARS", "USD"]}
      provisorios={2}
      reemplazo={4}
      defaultDate="2026-09-15"
    />
  );
}

function Analisis() {
  const horizonte = new Map(cuotas.map((r) => [r.accountId, MES]));
  const planes = openPlans(cuotas, horizonte, MES);
  const calendario = withCurrentMonth(commitmentCalendar(planes, 12), cuotas, MES);
  const periodos = [...new Set(cuotas.map((r) => r.period))].sort().reverse();
  const falta = remainingByCategory(planes);

  return (
    <AnalisisView
      flujo={installmentFlow(cuotas).filter((f) => f.currency === "ARS")}
      faltaPorCategoria={falta}
      variacion={[
        { label: "Financiacion", before: 41000000, after: 51732748, delta: 10732748 },
        { label: "Celular", before: 12000000, after: 8999991, delta: -3000009 },
        { label: "Una categoria con nombre largo", before: 0, after: 6616668, delta: 6616668 },
      ]}
      comparados={{ anterior: "2026-08", ultimo: MES }}
      ultimoEsProvisorio
      planes={planes}
      calendario={calendario}
      historico={periodos.map((period) => ({
        period,
        share: committedShare(
          cuotas
            .filter((r) => r.period === period)
            .map((r) => ({ amount: r.amount, currency: r.currency, kind: "installment" })),
        ),
        provisorios: period === MES ? 4 : 0,
        total: cuotas.filter((r) => r.period === period).length,
      }))}
      categorias={falta}
      totalCategorias={falta.reduce((t, c) => t + c.value, 0)}
      faltaPorPagar={[
        { currency: "ARS", amount: planes.reduce((t, x) => t + x.unpaidTotal, 0) },
      ]}
      periodos={periodos}
    />
  );
}

function Login() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-xl font-semibold tracking-tight">Finanzas</h1>
        <p className="mt-1 mb-8 text-sm text-muted">En qué se va la plata.</p>
        <LoginForm next="/" />
      </div>
    </div>
  );
}

function Cuentas() {
  return (
    <div className={gridDosColumnas}>
      <section className="min-w-0 space-y-6">
        <div>
          <h1 className="mb-3 text-lg font-semibold">Cuentas</h1>
          <ul className={lista}>
            {cuentas.map((a, i) => (
              <AccountRow
                key={a.id}
                account={{ ...a, movements: i === 0 ? 148 : 0 }}
                importCount={i === 0 ? 6 : 0}
              />
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted">
          La tarjeta se modela a nivel resumen, no por plastico: si dos tarjetas
          se pagan con un solo pago son una sola cuenta, y el numero de cada
          plastico va en el movimiento. Una cuenta con movimientos se archiva,
          no se borra: archivarla la saca del paso sin perder el historial.
        </p>
      </section>
      <aside className="min-w-0">
        <h2 className="mb-3 text-base font-semibold">Nueva cuenta</h2>
        <AccountForm />
      </aside>
    </div>
  );
}

function Ajustes() {
  const reglas = [
    "comercio con un nombre realmente largo sa sucursal centro",
    "plataforma servicio de suscripcion mensual",
    "kiosco",
  ];
  return (
    <div className={gridDosColumnas}>
      <div className="min-w-0 space-y-8">
        <section>
          <h1 className="mb-1 text-lg font-semibold">Ajustes</h1>
          <p className="text-sm text-muted">Sesion iniciada como alguien@ejemplo.com.</p>
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold">Categorias ({categorias.length})</h2>
          <ul className={lista}>
            {categorias.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-muted">Gasto</span>
                <button className={botonIcono}>
                  &times;
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold">Reglas aprendidas ({reglas.length})</h2>
          <ul className={lista}>
            {reglas.map((r) => (
              <li key={r} className="flex items-center gap-3 px-3 py-2 text-sm">
                <code className="min-w-0 flex-1 truncate text-xs">{r}</code>
                <span className="shrink-0 text-xs text-muted">Supermercado · 12 usos</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold">Contrasena</h2>
          <PasswordForm />
        </section>
      </div>
      <aside className="min-w-0">
        <h2 className="mb-3 text-base font-semibold">Nueva categoria</h2>
        <CategoryForm />
      </aside>
    </div>
  );
}

function Importar() {
  const activas = cuentas.filter((a) => a.active);
  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Importar</h1>
      <section>
        <h2 className="mb-1 text-base font-semibold">Subir resumen cerrado</h2>
        <p className="mb-3 text-sm text-muted">
          El PDF que manda el banco. Es el dato definitivo.
        </p>
        <UploadStatementForm accounts={activas} />
      </section>
      <section>
        <h2 className="mb-1 flex flex-wrap items-center gap-2 text-base font-semibold">
          Adelantar el mes en curso
          <span className={insignia}>provisorio</span>
        </h2>
        <p className="mb-3 text-sm text-muted">
          El resumen todavía no cerró y no hay PDF, pero los consumos ya están en
          el home banking. Pegá la tabla y mirá cómo viene el mes.
        </p>
        <PasteStatementForm accounts={activas} />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold">Resumenes importados</h2>
        <ul className={lista}>
          {resumenes.map((imp, i) => (
            <StatementRow key={imp.id} imp={imp} movimientos={i === 0 ? 148 : 0} />
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * La revision de un resumen.
 *
 * Antes era una **copia a mano** de la fila, que es justo la trampa que ya hizo
 * mirar capturas de un markup que las paginas reales no tenian. Ahora usa el
 * componente de verdad, y de paso entran a la auditoria el selector de cuenta,
 * los botones de borrado y la cabecera, que nunca habia medido nadie.
 */
function Revision() {
  const [porRevisar, ...mapeadas] = filasImportadas;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <span className="min-w-0 break-words">
              resumen-con-un-nombre-de-archivo-larguisimo-2026-09.pdf
            </span>
            <span className={insignia}>provisorio</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Banco Del Centro MASTERCARD · Periodo 2026-09 · 8 filas leidas · 6
            gastos · 1 por revisar
            {" · "}
            <span className="text-positive">reconcilia al centavo</span>
          </p>
        </div>
        <a
          href="#"
          className="-my-1.5 shrink-0 py-1.5 text-sm text-muted transition hover:text-foreground"
        >
          Volver
        </a>
      </div>

      <Aviso tono="acento">
        Sale de la lista del home banking, de un resumen que todavía no cerró.
        Los movimientos quedan marcados como provisorios y el PDF real los
        reemplaza cuando lo subas.
      </Aviso>

      <div className="flex flex-wrap items-center gap-3 rounded-contenedor border border-negative/40 bg-negative/10 px-3 py-2.5 text-sm">
        <span className="text-muted">Cuenta</span>
        <ImportAccountSelect importId="i0" accounts={cuentas} current={cuentas[0].id} />
        <span className="text-xs text-negative">
          El resumen dice Visa y la cuenta es una MasterCard. Si no es la que
          corresponde, cambiala antes de confirmar.
        </span>
      </div>

      <section>
        <h2 className="mb-1 text-base font-semibold">Por revisar (1)</h2>
        <p className="mb-3 text-sm text-muted">
          Lo que categorices acá se guarda como regla: el próximo resumen lo
          mapea solo.
        </p>
        <ImportRowList rows={[porRevisar]} categories={categorias} importId="i0" />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Ya mapeadas ({mapeadas.length})</h2>
        <ImportRowList rows={mapeadas} categories={categorias} importId="i0" />
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold text-muted">
          No se importan ({filasDescartadas.length})
        </h2>
        <p className="mb-3 text-sm text-muted">
          El resumen las trae y hacen falta para que reconcilie, pero no son
          gastos: el pago mueve plata entre cuentas propias y ese consumo ya esta
          contado en las lineas de arriba.
        </p>
        <ul className={lista}>
          {filasDescartadas.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-sm text-muted">
              <span className="tabular w-14 shrink-0 text-xs">
                {row.occurred_on?.slice(5)}
              </span>
              <span className="min-w-0 flex-1 truncate">{row.raw_description}</span>
              <span className="shrink-0 text-xs">Pago</span>
              <Amount cents={row.amount} currency={row.currency} className="shrink-0" />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button className={botonAcento}>Cargar 6 movimientos provisorios</button>
        <span className="text-sm text-muted">Falta categorizar 1.</span>
        <div className="ml-auto">
          <DeleteImportButton importId="i0" transactionCount={0} label="Descartar resumen" />
        </div>
      </div>
    </div>
  );
}
