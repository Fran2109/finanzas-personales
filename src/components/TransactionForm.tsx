"use client";

import { useActionState, useMemo, useState } from "react";
import { createTransaction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import {
  CATEGORY_KIND_FOR,
  KIND_HELP,
  KIND_LABELS,
  MANUAL_KINDS,
  type Currency,
  type Kind,
} from "@/lib/domain";
import type { Account, Category, NotasPorCategoria } from "@/lib/data";
import { NotaInput } from "@/components/NotaInput";
import { campo as field, chip, etiqueta as label } from "@/components/ui/estilos";
import { Aviso } from "@/components/ui/Aviso";

export function TransactionForm({
  accounts,
  categories,
  notas,
  defaultDate,
}: {
  accounts: Account[];
  categories: Category[];
  notas: NotasPorCategoria;
  defaultDate: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(createTransaction, {});
  const [kind, setKind] = useState<Kind>("consumption");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");

  const account = accounts.find((a) => a.id === accountId);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === CATEGORY_KIND_FOR[kind]),
    [categories, kind],
  );

  // Al guardar, el servidor crea la categoria nueva y revalida, asi que la
  // categoria vuelve en `categories`. Verla aparecer en la lista es la senal de
  // que ya existe: el campo de texto se cierra y queda elegida, que es lo que
  // hace falta si el proximo movimiento es de lo mismo. Se deriva en el render
  // y no se sincroniza con un efecto, que es un render de mas para llegar al
  // mismo lado.
  const recienCreada = useMemo(() => {
    if (!creandoCategoria) return undefined;
    const buscado = nombreNuevo.trim().toLowerCase();
    if (!buscado) return undefined;
    return visibleCategories.find((c) => c.name.toLowerCase() === buscado);
  }, [creandoCategoria, nombreNuevo, visibleCategories]);

  const creando = creandoCategoria && !recienCreada;
  const categoriaElegida = recienCreada?.id ?? categoryId;

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted">
        Primero crea una cuenta en{" "}
        <a className="text-accent underline" href="/cuentas">
          Cuentas
        </a>
        .
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <span className={label}>Tipo</span>
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
              className={chip(kind === k)}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <input type="hidden" name="kind" value={kind} />
        <p className="mt-2 text-xs leading-relaxed text-muted">{KIND_HELP[kind]}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <div>
          <label className={label} htmlFor="amount">
            Monto
          </label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="12.500,40"
            required
            autoFocus
            className={`${field} tabular`}
          />
        </div>
        <div>
          <label className={label} htmlFor="currency">
            Moneda
          </label>
          <select
            id="currency"
            name="currency"
            defaultValue={(account?.currency ?? "ARS") as Currency}
            key={account?.currency}
            className={field}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <div>
          <label className={label} htmlFor="occurred_on">
            Fecha
          </label>
          <input
            id="occurred_on"
            name="occurred_on"
            type="date"
            defaultValue={defaultDate}
            required
            className={`${field} tabular`}
          />
        </div>
        <div>
          <label className={label} htmlFor="account_id">
            Cuenta
          </label>
          <select
            id="account_id"
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

      <div>
        <label className={label} htmlFor="description">
          Descripcion
        </label>
        <input
          id="description"
          name="description"
          autoComplete="off"
          placeholder="Coto, nafta, Netflix..."
          className={field}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <div>
          <label
            className={label}
            htmlFor={creando ? "new_category" : "category_id"}
          >
            Categoria
          </label>
          {/* Crear la categoria aca y no en Ajustes: salir del formulario a
              mitad de carga es lo que hace que el gasto termine sin categoria.
              La familia la fija el tipo, asi que no hay nada mas que elegir
              que el nombre. */}
          {creando ? (
            <>
              <input
                id="new_category"
                name="new_category"
                required
                autoFocus
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
                className="mt-1 text-xs text-muted transition hover:text-foreground"
              >
                Cancelar
              </button>
            </>
          ) : (
            <select
              id="category_id"
              name="category_id"
              className={field}
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
            >
              <option value="">Sin categoria</option>
              {visibleCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__nueva__">+ Nueva categoria...</option>
            </select>
          )}
        </div>
        {account?.is_liability ? (
          <div>
            <label className={label} htmlFor="card_last4">
              Plastico
            </label>
            <input
              id="card_last4"
              name="card_last4"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              className={`${field} tabular`}
            />
          </div>
        ) : null}
      </div>

      {/* Va despues de la categoria y no antes, porque las sugerencias salen de
          la categoria elegida: el orden del formulario deja ver esa dependencia
          en vez de esconderla. */}
      <div>
        <label className={label} htmlFor="nota">
          Nota
        </label>
        <NotaInput notas={notas} categoryId={categoriaElegida} />
      </div>

      {state.error ? (
        <Aviso tono="negativo">
          {state.error}
        </Aviso>
      ) : null}
      {state.ok ? (
        <Aviso tono="positivo">
          {state.ok}
        </Aviso>
      ) : null}

      <SubmitButton className="w-full">Agregar movimiento</SubmitButton>
    </form>
  );
}
