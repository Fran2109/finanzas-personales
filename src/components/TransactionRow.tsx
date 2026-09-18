"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  deleteTransaction,
  repeatTransaction,
  updateNota,
  updateTransaction,
  type FormState,
} from "@/app/actions";
import { Amount } from "@/components/Amount";
import { SubmitButton } from "@/components/SubmitButton";
import {
  CATEGORY_KIND_FOR,
  KIND_LABELS,
  MANUAL_KINDS,
  type Kind,
} from "@/lib/domain";
import type { Account, Category, NotasPorCategoria, Transaction } from "@/lib/data";
import { NotaInput } from "@/components/NotaInput";
import {
  botonBorde,
  botonIcono,
  campoCompacto as field,
  etiquetaCompacta as label,
  insignia,
} from "@/components/ui/estilos";
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
  notas,
}: {
  tx: Transaction;
  accounts: Account[];
  categories: Category[];
  notas: NotasPorCategoria;
}) {
  const [abierto, setAbierto] = useState(false);
  // Un solo panel abierto por fila, y por eso es un estado y no una bandera por
  // accion: dos paneles abiertos a la vez en una banda de 60px no se leen.
  const [panel, setPanel] = useState<"nota" | "repetir" | null>(null);

  if (!abierto) {
    const titulo = tx.nota || tx.description || KIND_LABELS[tx.kind];
    // Lo que vino de un resumen no se repite: la copia seria un movimiento que
    // el PDF no tiene. Ver `repeatTransaction`.
    const repetible = tx.fingerprint === null;

    return (
      <li>
        {/* El boton que abre el editor cubre la fila entera y va **por debajo**
            del contenido, en vez de contenerlo.

            Es lo que permite que el gatillo de la nota sea un boton de verdad:
            un `<button>` no puede vivir adentro de otro, asi que mientras la
            fila era un solo boton no habia donde poner una accion mas. Al estar
            posicionado, el overlay pinta por encima del texto en flujo normal y
            se lleva los clicks igual que antes; los dos controles que tienen que
            recibir el suyo se suben con `relative z-10`. */}
        {/* `key` y no un detalle: `.abre` anima con `@starting-style`, que solo
            aplica a un nodo **recien insertado**. Los dos estados de la fila
            arrancan con un `<div>`, asi que sin key React reusa el mismo nodo,
            el navegador no lo ve nacer y el editor salta a su alto final en el
            primer frame — la animacion entera perdida, y sin un solo error. */}
        <div key="fila" className="relative flex items-center gap-3 px-3 py-2.5 text-sm">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="absolute inset-0 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={`Corregir ${titulo}`}
          />

          <span className="tabular w-12 shrink-0 text-xs text-muted">
            {tx.occurred_on.slice(8)}/{tx.occurred_on.slice(5, 7)}
          </span>

          <span className="min-w-0 flex-1">
            {/* Tres lineas, y la jerarquia la carga el tipo y no el color.

                Antes la nota y el texto del resumen compartian linea separados
                por un punto, y eso las hacia competir por el mismo ancho: con
                una nota larga el resumen desaparecia, y con un resumen largo se
                perdia el final de la nota. Ahora cada una tiene su linea y
                ninguna se come a la otra.

                Arriba va lo que uno escribio, en cuerpo y con peso: es el dato.
                Abajo lo que decia el PDF, chico y en gris: es de donde salio.

                **Envuelve, no trunca**, y esa es la unica linea de la fila que
                lo hace. Comparte renglon con el importe, asi que en un telefono
                le quedan ~120px: truncando, "regalo de cumple de la madre de un
                amigo" se leia "regalo de cumpl..." y la nota entera —que es el
                dato que uno escribio— desaparecia. Lo que sigue abajo si se
                recorta, porque es contexto. `anywhere` porque una descripcion
                de resumen puede ser una sola palabra de 43 caracteres.

                Con tope de tres lineas, que es donde envolver deja de pagar:
                una nota entra entera, pero un `PERCEPCION RG 4240 SOBRE
                CONSUMOS EN MONEDA EXTRANJERA` sin nota se comia seis renglones
                y empujaba al resto de la lista fuera de la pantalla. */}
            <span className="line-clamp-3 font-medium [overflow-wrap:anywhere]">
              {titulo}
            </span>

            {/* La linea de la nota, que siempre esta y por eso las filas miden
                todas lo mismo: cuando hay nota lleva el texto del resumen (de
                donde salio el titulo) y cuando no, la invitacion a ponerla.

                Que el gatillo viva aca y no en los metadatos de abajo no es
                acomodo: "+ nota" solo aparece donde falta, asi que barrer la
                lista y ver que queda por anotar es mirar una columna — y la
                linea de metadatos conserva su ancho, que en un telefono es la
                diferencia entre decir la categoria y la cuenta o no decirlas. */}
            <span className="flex items-center gap-2 text-xs text-muted">
              {/* El gatillo va **primero** y no despues del texto del resumen:
                  asi "+ nota" y el lapiz caen siempre en la misma x y la
                  columna se barre de un vistazo. Atras del texto, que mide
                  distinto en cada fila, el lapiz quedaba desparramado. */}
              <button
                type="button"
                onClick={() => setPanel("nota")}
                aria-label={
                  tx.nota ? `Editar la nota de ${titulo}` : `Agregar una nota a ${titulo}`
                }
                className={`relative z-10 -my-1.5 shrink-0 rounded-control px-2 py-1.5 transition hover:text-foreground ${
                  tx.nota ? "" : "underline decoration-dotted underline-offset-2"
                }`}
              >
                {tx.nota ? "✎" : "+ nota"}
              </button>

              {/* "Repetir" vive en esta linea y no en la columna de acciones
                  por la misma razon que el gatillo de la nota: a la derecha le
                  sacaria ancho al titulo en un telefono. Y cae justo donde hay
                  lugar — una fila que se puede repetir es una cargada a mano,
                  o sea sin texto de resumen que poner al lado. */}
              {repetible ? (
                <button
                  type="button"
                  onClick={() => setPanel("repetir")}
                  aria-label={`Repetir ${titulo} en otra fecha`}
                  className="relative z-10 -my-1.5 shrink-0 rounded-control px-2 py-1.5 underline decoration-dotted underline-offset-2 transition hover:text-foreground"
                >
                  repetir
                </button>
              ) : null}

              {tx.nota && tx.description ? (
                <span className="min-w-0 truncate">{tx.description}</span>
              ) : null}
            </span>

            {/* El badge va primero y no pegado al titulo. Adentro del truncate
                del titulo no se veia nunca en un telefono; al lado, se comia el
                titulo entero ("C..."). Aca esta siempre visible y lo que se
                recorta es la cola de los metadatos. */}
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

          <form action={deleteTransaction} className="relative z-10">
            <input type="hidden" name="id" value={tx.id} />
            <button
              type="submit"
              aria-label="Borrar movimiento"
              className={botonIcono}
            >
              &times;
            </button>
          </form>
        </div>

        {/* `key={panel}`: pasar de un panel al otro sin cerrar reusaria el
            mismo nodo, y `@starting-style` solo aplica a uno recien insertado.
            Sin esto el segundo aparece de golpe. */}
        {panel ? (
          <div key={panel} className="abre">
            <div>
              <div className="px-3 pb-3">
                {panel === "nota" ? (
                  <NotaForm tx={tx} notas={notas} cerrar={() => setPanel(null)} />
                ) : (
                  <RepetirForm tx={tx} cerrar={() => setPanel(null)} />
                )}
              </div>
            </div>
          </div>
        ) : null}
      </li>
    );
  }

  // `.abre` lleva el alto de 0 al real sin que nadie lo mida (ver globals.css).
  // El padding va adentro del recorte, o queda visible con el editor en cero y
  // la fila arranca con un escalon.
  return (
    <li className="bg-background/40">
      {/* La otra mitad del par: con una key distinta de la de la fila, React
          descarta el nodo viejo y monta este, que es lo que `@starting-style`
          necesita para dar el estado de entrada. */}
      <div key="editor" className="abre">
        <div>
          <div className="px-3 py-3">
            <Editor
              tx={tx}
              accounts={accounts}
              categories={categories}
              notas={notas}
              cerrar={() => setAbierto(false)}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Cambiar **solo** la nota, sin pasar por el editor completo.
 *
 * Anotar un movimiento ya cargado es la correccion mas frecuente y la mas
 * barata, y con el editor entero costaba lo mismo que cambiarle el monto: se
 * abrian tipo, monto, moneda, fecha, cuenta, categoria y plastico para tocar el
 * ultimo campo. Un gesto en vez de cinco.
 *
 * Que se pueda separar asi no es comodidad: es que `nota` no entra en la huella
 * (ver `updateNota`). Si entrara, este formulario tendria que arrastrar todos
 * los campos que la componen y no habria atajo posible.
 */
function NotaForm({
  tx,
  notas,
  cerrar,
}: {
  tx: Transaction;
  notas: NotasPorCategoria;
  cerrar: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateNota, {});

  useEffect(() => {
    if (state.ok) cerrar();
  }, [state.ok, cerrar]);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={tx.id} />
      {/* `basis-56` con `min-w-0`: el campo arranca ancho y en un telefono se
          achica en vez de empujar a los botones fuera de la pantalla. */}
      <span className="min-w-0 flex-1 basis-56">
        <NotaInput
          notas={notas}
          categoryId={tx.category?.id ?? ""}
          defaultValue={tx.nota ?? ""}
          id={`nota-lista-${tx.id}`}
          compacto
          autoFocus
        />
      </span>
      <SubmitButton>Guardar</SubmitButton>
      <button type="button" onClick={cerrar} className={botonBorde()}>
        Cancelar
      </button>
      {state.error ? (
        <span className="basis-full">
          <Aviso tono="negativo" compacto>
            {state.error}
          </Aviso>
        </span>
      ) : null}
    </form>
  );
}

/**
 * Volver a cargar el mismo gasto en otra fecha.
 *
 * Pregunta **cuando y cuanto, y nada mas**: todo lo demas —cuenta, categoria,
 * tipo, descripcion, nota— se copia, que es justo lo que hace que repetir sea
 * mas barato que cargar de cero. El monto va editable y no fijo porque un gasto
 * que se repite no siempre sale igual: el mismo estacionamiento puede salir
 * distinto, y obligar a corregirlo despues en el editor completo seria devolver
 * la friccion que esto viene a sacar.
 *
 * La fecha arranca **hoy**, que es el caso que trae a alguien a repetir algo.
 */
function RepetirForm({ tx, cerrar }: { tx: Transaction; cerrar: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(repeatTransaction, {});

  useEffect(() => {
    if (state.ok) cerrar();
  }, [state.ok, cerrar]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={tx.id} />
      <div className="min-w-0 flex-1 basis-36">
        <label className={label} htmlFor={`rep-fecha-${tx.id}`}>
          Fecha
        </label>
        <input
          id={`rep-fecha-${tx.id}`}
          name="occurred_on"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
          autoFocus
          className={`${field} tabular`}
        />
      </div>
      <div className="min-w-0 flex-1 basis-28">
        <label className={label} htmlFor={`rep-monto-${tx.id}`}>
          Monto
        </label>
        <input
          id={`rep-monto-${tx.id}`}
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={(tx.amount / 100).toFixed(2).replace(".", ",")}
          required
          className={`${field} tabular`}
        />
      </div>
      <SubmitButton pendingLabel="Repitiendo...">Repetir</SubmitButton>
      <button type="button" onClick={cerrar} className={botonBorde()}>
        Cancelar
      </button>
      {state.error ? (
        <span className="basis-full">
          <Aviso tono="negativo" compacto>
            {state.error}
          </Aviso>
        </span>
      ) : null}
    </form>
  );
}

function Editor({
  tx,
  accounts,
  categories,
  notas,
  cerrar,
}: {
  tx: Transaction;
  accounts: Account[];
  categories: Category[];
  notas: NotasPorCategoria;
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

      {/* Despues de la categoria: las sugerencias salen de ella. */}
      <div>
        <label className={label} htmlFor={`nota-${tx.id}`}>
          Nota
        </label>
        <NotaInput
          notas={notas}
          categoryId={categoriaElegida}
          defaultValue={tx.nota ?? ""}
          id={`nota-${tx.id}`}
        />
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
