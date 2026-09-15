"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import { deleteTransaction, updateTransaction, type FormState } from "@/app/actions";
import { Amount } from "@/components/Amount";
import { SubmitButton } from "@/components/SubmitButton";
import {
  CATEGORY_KIND_FOR,
  KIND_LABELS,
  MANUAL_KINDS,
  type Kind,
} from "@/lib/domain";
import type { Account, Category, Transaction } from "@/lib/data";
import { botonIcono, campoCompacto as field, etiquetaCompacta as label, insignia } from "@/components/ui/estilos";
import { Aviso } from "@/components/ui/Aviso";


/**
 * Una fila del mes, que se abre para editarse.
 *
 * Editar en el lugar y no en otra pantalla: revisar el mes y corregir lo que
 * esta mal es el mismo gesto, y mandar a la persona a otro lado en el medio es
 * lo que hace que las correcciones no se hagan.
 */
export function TransactionRow({
  tx,
  accounts,
  categories,
}: {
  tx: Transaction;
  accounts: Account[];
  categories: Category[];
}) {
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`Editar ${tx.description ?? KIND_LABELS[tx.kind]}`}
        >
          <span className="tabular w-12 shrink-0 text-xs text-muted">
            {tx.occurred_on.slice(8)}/{tx.occurred_on.slice(5, 7)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              {tx.description || KIND_LABELS[tx.kind]}
            </span>
            {/* El badge va en la linea de metadatos y primero, no pegado a la
                descripcion. Adentro del truncate de la descripcion no se veia
                nunca en un telefono; al lado, se comia la descripcion entera
                ("C..."). Aca esta siempre visible y no le saca lugar a nada:
                lo que se recorta es la cola de los metadatos, como antes. */}
            <span className="flex items-center gap-2 text-xs text-muted">
              {tx.is_projected ? (
                <span className={insignia}>
                  provisorio
                </span>
              ) : null}
              <span className="min-w-0 truncate">
              {[
                tx.category?.name,
                tx.account?.name,
                tx.card_last4 ? `*${tx.card_last4}` : null,
                tx.kind === "consumption" ? null : KIND_LABELS[tx.kind],
                // Explica por que una compra de junio aparece en agosto.
                tx.statement_period && tx.statement_period !== tx.occurred_on.slice(0, 7)
                  ? `resumen ${tx.statement_period}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              </span>
            </span>
          </span>
          <Amount cents={tx.amount} currency={tx.currency} className="shrink-0" />
        </button>
        <form action={deleteTransaction}>
          <input type="hidden" name="id" value={tx.id} />
          <button
            type="submit"
            aria-label="Borrar movimiento"
            className={botonIcono}
          >
            &times;
          </button>
        </form>
      </li>
    );
  }

  // `.abre` lleva el alto de 0 al real sin que nadie lo mida (ver globals.css).
  // El padding va adentro del recorte, o queda visible con el editor en cero y
  // la fila arranca con un escalon.
  return (
    <li className="bg-background/40">
      <div className="abre">
        <div>
          <div className="px-3 py-3">
            <Editor
              tx={tx}
              accounts={accounts}
              categories={categories}
              cerrar={() => setAbierto(false)}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

function Editor({
  tx,
  accounts,
  categories,
  cerrar,
}: {
  tx: Transaction;
  accounts: Account[];
  categories: Category[];
  cerrar: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateTransaction, {});
  const [kind, setKind] = useState<Kind>(tx.kind);
  const [accountId, setAccountId] = useState(tx.account?.id ?? accounts[0]?.id ?? "");
  // La categoria que trae el movimiento solo sirve si es de la familia de su
  // tipo; si no, la fila arranca sin categoria y hay que elegir de nuevo.
  const [categoryId, setCategoryId] = useState(() =>
    categories.some(
      (c) => c.id === tx.category?.id && c.kind === CATEGORY_KIND_FOR[tx.kind],
    )
      ? (tx.category?.id ?? "")
      : "",
  );
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");

  const cuenta = accounts.find((a) => a.id === accountId);

  const visibles = useMemo(
    () => categories.filter((c) => c.kind === CATEGORY_KIND_FOR[kind]),
    [categories, kind],
  );

  // Igual que en el alta: la categoria recien creada se reconoce por verla
  // aparecer en la lista revalidada, no por un efecto que sincronice.
  const recienCreada = useMemo(() => {
    if (!creandoCategoria) return undefined;
    const buscado = nombreNuevo.trim().toLowerCase();
    if (!buscado) return undefined;
    return visibles.find((c) => c.name.toLowerCase() === buscado);
  }, [creandoCategoria, nombreNuevo, visibles]);

  const creando = creandoCategoria && !recienCreada;
  const categoriaElegida = recienCreada?.id ?? categoryId;

  // Guardar cierra la fila. El servidor ya revalido, asi que al cerrarse se ve
  // el valor nuevo y no el que se acaba de tipear.
  useEffect(() => {
    if (state.ok) cerrar();
  }, [state.ok, cerrar]);

  // El monto se edita con coma, como se tipea. En negativo si es una
  // devolucion: ahi el movimiento resta solo, sin necesitar un tipo aparte.
  const montoInicial = (tx.amount / 100).toFixed(2).replace(".", ",");

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={tx.id} />
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-wrap gap-1.5">
        {MANUAL_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              // La categoria elegida pertenece a la familia del tipo anterior.
              setCategoryId("");
              setCreandoCategoria(false);
            }}
            className={`rounded-md border px-2.5 py-1 text-xs transition ${
              kind === k
                ? "border-accent bg-accent text-background"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <div>
        <label className={label} htmlFor={`desc-${tx.id}`}>
          Descripcion
        </label>
        <input
          id={`desc-${tx.id}`}
          name="description"
          defaultValue={tx.description ?? ""}
          autoComplete="off"
          autoFocus
          className={field}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 *:min-w-0 sm:grid-cols-4">
        <div>
          <label className={label} htmlFor={`monto-${tx.id}`}>
            Monto
          </label>
          <input
            id={`monto-${tx.id}`}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={montoInicial}
            required
            className={`${field} tabular`}
          />
        </div>
        <div>
          <label className={label} htmlFor={`mon-${tx.id}`}>
            Moneda
          </label>
          <select
            id={`mon-${tx.id}`}
            name="currency"
            defaultValue={tx.currency}
            className={field}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`fecha-${tx.id}`}>
            Fecha
          </label>
          <input
            id={`fecha-${tx.id}`}
            name="occurred_on"
            type="date"
            defaultValue={tx.occurred_on}
            required
            className={`${field} tabular`}
          />
        </div>
        <div>
          <label className={label} htmlFor={`cta-${tx.id}`}>
            Cuenta
          </label>
          <select
            id={`cta-${tx.id}`}
            name="account_id"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={field}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <div>
          <label
            className={label}
            htmlFor={creando ? `new-cat-${tx.id}` : `cat-${tx.id}`}
          >
            Categoria
          </label>
          {/* Corregir la categoria de un movimiento es donde mas se nota que
              falta una: mandar a Ajustes en el medio es lo que hace que la
              correccion no se haga. La familia la fija el tipo. */}
          {creando ? (
            <>
              <input
                id={`new-cat-${tx.id}`}
                name="new_category"
                required
                autoComplete="off"
                placeholder="Seguros"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                className={`${field} border-accent`}
              />
              <button
                type="button"
                onClick={() => {
                  setCreandoCategoria(false);
                  setNombreNuevo("");
                }}
                className="mt-1 text-[11px] text-muted transition hover:text-foreground"
              >
                Cancelar
              </button>
            </>
          ) : (
            <select
              id={`cat-${tx.id}`}
              name="category_id"
              value={categoriaElegida}
              onChange={(e) => {
                if (e.target.value === "__nueva__") {
                  setCreandoCategoria(true);
                  // Vacio, o el nombre de la vuelta anterior ya estaria en la
                  // lista y el campo se cerraria antes de poder tipear.
                  setNombreNuevo("");
                  return;
                }
                setCreandoCategoria(false);
                setCategoryId(e.target.value);
              }}
              className={field}
            >
              <option value="">Sin categoria</option>
              {visibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__nueva__">+ Nueva categoria...</option>
            </select>
          )}
        </div>
        {cuenta?.is_liability ? (
          <div>
            <label className={label} htmlFor={`card-${tx.id}`}>
              Plastico
            </label>
            <input
              id={`card-${tx.id}`}
              name="card_last4"
              inputMode="numeric"
              maxLength={4}
              defaultValue={tx.card_last4 ?? ""}
              placeholder="1234"
              className={`${field} tabular`}
            />
          </div>
        ) : null}
      </div>

      {/* Apagado por defecto: corregir la categoria de UN movimiento no siempre
          quiere decir que el comercio entero este mal clasificado. */}
      {/* -my-1.5 py-1.5: el label mide 18px de alto y es todo el area tocable
          del checkbox. El padding lo lleva a target de dedo y el margen
          negativo lo devuelve a su lugar, asi que la fila no engorda. */}
      <label className="-my-1.5 flex cursor-pointer items-start gap-2 py-1.5 text-xs text-muted">
        <input type="checkbox" name="learn" className="mt-0.5 accent-current" />
        <span>
          Aplicar esta categoria a este comercio de ahora en mas. Escribe una
          regla, asi el proximo resumen lo mapea solo.
        </span>
      </label>

      {state.error ? (
        <Aviso tono="negativo" compacto>
          {state.error}
        </Aviso>
      ) : null}

      <div className="flex items-center gap-2">
        <SubmitButton>Guardar</SubmitButton>
        <button
          type="button"
          onClick={cerrar}
          className="rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:text-foreground"
        >
          Cancelar
        </button>
        {tx.fingerprint ? (
          <span className="ml-auto text-right text-[11px] leading-tight text-muted">
            Vino de un resumen. Si cambias monto, fecha, descripcion o cuenta,
            deja de coincidir con esa linea del PDF.
          </span>
        ) : null}
      </div>
    </form>
  );
}
