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
import { AccountRow } from "@/components/AccountRow";
import { Amount } from "@/components/Amount";
import { CategoryForm } from "@/components/CategoryForm";
import { LoginForm } from "@/components/LoginForm";
import { MesView } from "@/components/MesView";
import { PasswordForm } from "@/components/PasswordForm";
import { PasteStatementForm } from "@/components/PasteStatementForm";
import { RowCategorySelect } from "@/components/RowCategorySelect";
import { UploadStatementForm } from "@/components/UploadStatementForm";
import { cuentas, categorias, movimientos, summary, MES } from "./datos";

/**
 * Sin esto Next la prerenderiza y evalua `process.env` en el build, cuando la
 * variable no existe: la pagina queda con el 404 horneado adentro y nunca se
 * muestra, prendas la variable que prendas al levantar el server.
 */
export const dynamic = "force-dynamic";

export const PANTALLAS = [
  "mes",
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
        {p === "cuentas" ? <Cuentas /> : null}
        {p === "ajustes" ? <Ajustes /> : null}
        {p === "importar" ? <Importar /> : null}
        {p === "revision" ? <Revision /> : null}
        {p === "login" ? <LoginForm next="/" /> : null}
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

function Cuentas() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <section className="min-w-0 space-y-6">
        <div>
          <h1 className="mb-3 text-lg font-semibold">Cuentas</h1>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {cuentas.map((a, i) => (
              <AccountRow
                key={a.id}
                account={{ ...a, movements: i === 0 ? 148 : 0 }}
                importCount={i === 0 ? 6 : 0}
              />
            ))}
          </ul>
        </div>
      </section>
      <aside className="min-w-0">
        <h2 className="mb-3 text-sm font-semibold">Nueva cuenta</h2>
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
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-8">
        <section>
          <h1 className="mb-1 text-lg font-semibold">Ajustes</h1>
          <p className="text-sm text-muted">Sesion iniciada como alguien@ejemplo.com.</p>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold">Categorias ({categorias.length})</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {categorias.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-muted">Gasto</span>
                <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted transition hover:text-negative">
                  &times;
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold">Reglas aprendidas ({reglas.length})</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {reglas.map((r) => (
              <li key={r} className="flex items-center gap-3 px-3 py-2 text-sm">
                <code className="min-w-0 flex-1 truncate text-xs">{r}</code>
                <span className="shrink-0 text-xs text-muted">Supermercado</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold">Contrasena</h2>
          <PasswordForm />
        </section>
      </div>
      <aside className="min-w-0">
        <h2 className="mb-3 text-sm font-semibold">Nueva categoria</h2>
        <CategoryForm />
      </aside>
    </div>
  );
}

function Importar() {
  const activas = cuentas.filter((a) => a.active);
  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-3 text-lg font-semibold">Importar un resumen</h1>
        <UploadStatementForm accounts={activas} />
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Pegar el mes en curso</h2>
        <PasteStatementForm accounts={activas} />
      </section>
    </div>
  );
}

function Revision() {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {movimientos.map((t, i) => (
        <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
          <span className="tabular w-14 shrink-0 text-xs text-muted">09-0{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate">{t.description}</div>
            <div className="text-xs text-muted">Cuota · *1234 · cuota 6/12</div>
          </div>
          <Amount cents={t.amount} currency={t.currency} tone="auto" className="shrink-0" />
          <RowCategorySelect
            rowId={t.id}
            categories={categorias}
            defaultKind="installment"
            defaultValue={categorias[i % categorias.length].id}
          />
          <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted transition hover:text-negative">
            &times;
          </button>
        </li>
      ))}
    </ul>
  );
}
