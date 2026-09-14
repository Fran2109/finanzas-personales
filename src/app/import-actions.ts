"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/retry";
import {
  CATEGORY_KIND_FOR,
  isExpenseKind,
  isKind,
  isPeriod,
  toExpenseKind,
  normalizeAmountForKind,
  normalizeMerchant,
  periodOfDate,
  periodRange,
  type Currency,
  type Kind,
} from "@/lib/domain";
import { centsToNumeric } from "@/lib/money";
import { extractPdfText } from "@/lib/import/pdf";
import { BANK_LABELS, parseStatement } from "@/lib/import/detect";
import { parsePastedStatement } from "@/lib/import/pegado";
import type { ParsedStatement } from "@/lib/import/types";
import { matchAccount, type KnownCard, type StatementIdentity } from "@/lib/import/match-account";
import {
  diagnosticRows,
  reconcile,
  type DiagnosticRow,
  type Reconciliation,
} from "@/lib/import/reconcile";
import { withFingerprints } from "@/lib/import/fingerprint";
import { suggestCategory, suggestPattern, type Rule } from "@/lib/import/categorize";
import type { FormState } from "@/app/actions";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Lo que se muestra cuando un resumen no reconcilia.
 *
 * El gate rechaza el import entero, que es lo correcto, pero decir solo
 * "difieren 22,88" deja a la persona con un PDF y una calculadora. Con la
 * transcripcion al lado se ve cual es el renglon que el lector leyo mal.
 */
export type UploadState = FormState & {
  diagnostico?: {
    brand: string | null;
    periodClose: string | null;
    currencies: Reconciliation["currencies"];
    unparsedLines: string[];
    rows: DiagnosticRow[];
  };
};

/**
 * Sube un resumen, lo lee y lo deja en staging.
 *
 * La reconciliacion es un gate, no un warning: si no cierra al centavo no se
 * escribe absolutamente nada y el import se rechaza entero.
 */
export async function uploadStatement(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const { supabase } = await requireUser();

  // Vacio quiere decir "inferilo del resumen", que es el caso normal. Elegir
  // una cuenta a mano es el override.
  const elegida = String(formData.get("account_id") ?? "");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Subi el PDF del resumen." };
  if (file.size > MAX_PDF_BYTES) return { error: "El PDF no puede pesar mas de 10 MB." };

  let text: string;
  try {
    text = await extractPdfText(await file.arrayBuffer());
  } catch (e) {
    return { error: `No se pudo leer el PDF: ${e instanceof Error ? e.message : e}` };
  }

  const leido = parseStatement(text);
  if (!leido) {
    return {
      error:
        "No reconozco el formato de este resumen. Por ahora se leen los de " +
        `${Object.values(BANK_LABELS).join(" y ")}, VISA y MASTERCARD.`,
    };
  }

  const { bank, statement } = leido;
  const identity: StatementIdentity = {
    bank,
    brand: statement.brand,
    cardsLast4: statement.cardSubtotals.map((c) => c.cardLast4),
  };

  const check = reconcile(statement);

  if (!check.ok) {
    // Falla ruidosa a proposito: nada llega a la base. Pero se devuelve la
    // transcripcion para poder ver que leyo mal.
    return {
      error: check.problems.join(" "),
      diagnostico: {
        brand: statement.brand,
        periodClose: statement.periodClose,
        currencies: check.currencies,
        unparsedLines: check.unparsedLines,
        rows: diagnosticRows(statement),
      },
    };
  }

  return stage(supabase, {
    statement,
    identity,
    elegida,
    filename: file.name,
    periodClose: statement.periodClose,
    provisional: false,
  });
}

/**
 * Sube una lista de consumos pegada del home banking.
 *
 * Es el mismo pipeline que un PDF —mismo gate, mismo staging, misma pantalla de
 * revision— con dos diferencias: el periodo lo elige la persona porque la lista
 * no dice a que resumen pertenece, y lo que se carga queda marcado como
 * provisorio para que el PDF real lo reemplace despues.
 */
export async function uploadPastedStatement(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const { supabase } = await requireUser();

  const elegida = String(formData.get("account_id") ?? "");
  const texto = String(formData.get("texto") ?? "");
  const periodo = String(formData.get("periodo") ?? "");

  if (texto.trim().length === 0) return { error: "Pega la lista de consumos." };
  if (!isPeriod(periodo)) return { error: "Elegi a que mes corresponde." };

  const statement = parsePastedStatement(texto);
  const check = reconcile(statement);

  if (!check.ok) {
    return {
      error: check.problems.join(" "),
      diagnostico: {
        brand: statement.brand,
        periodClose: null,
        currencies: check.currencies,
        unparsedLines: check.unparsedLines,
        rows: diagnosticRows(statement),
      },
    };
  }

  return stage(supabase, {
    statement,
    // El home banking no dice de que banco es: adentro ya se sabe. La cuenta
    // se infiere por el plastico, que es la senal que no necesita el banco.
    identity: {
      bank: null,
      brand: statement.brand,
      cardsLast4: [...new Set(statement.rows.map((r) => r.cardLast4).filter((c): c is string => !!c))],
    },
    elegida,
    filename: `Pegado ${periodo}`,
    // Una lista del mes en curso no tiene cierre. Se guarda el ultimo dia del
    // periodo elegido para que caiga en el mes que corresponde; la pantalla lo
    // muestra como periodo, no como fecha de cierre, porque no lo es.
    periodClose: periodRange(periodo).to,
    provisional: true,
  });
}

type StageInput = {
  statement: ParsedStatement;
  identity: StatementIdentity;
  elegida: string;
  filename: string;
  periodClose: string | null;
  provisional: boolean;
};

/**
 * Lo comun entre un PDF y un pegado, una vez que el gate ya dio ok: inferir la
 * cuenta, crear el import y dejar cada fila en staging con su categoria
 * sugerida.
 */
async function stage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  { statement, identity, elegida, filename, periodClose, provisional }: StageInput,
): Promise<UploadState> {
  const [rules, categories, cuentas, plasticos] = await Promise.all([
    withRetry(() => supabase.from("merchant_rules").select("id, pattern, category_id")),
    withRetry(() => supabase.from("categories").select("id, kind")),
    withRetry(() => supabase.from("accounts").select("id, name").eq("active", true)),
    // De que cuenta vino cada plastico que ya se importo. Es la senal mas
    // fuerte para saber a quien pertenece este resumen.
    withRetry(() =>
      supabase
        .from("transactions")
        .select("account_id, card_last4")
        .not("card_last4", "is", null),
    ),
  ]);
  if (rules.error) return { error: `No se pudieron leer las reglas: ${rules.error.message}` };
  if (categories.error) return { error: `No se pudieron leer las categorias: ${categories.error.message}` };
  if (cuentas.error) return { error: `No se pudieron leer las cuentas: ${cuentas.error.message}` };

  const knownCards: KnownCard[] = ((plasticos.data ?? []) as {
    account_id: string;
    card_last4: string;
  }[]).map((t) => ({ cardLast4: t.card_last4, accountId: t.account_id }));

  const inferida = matchAccount(identity, cuentas.data ?? [], knownCards);
  const accountId = elegida || inferida.accountId;

  if (!accountId) {
    // Una tabla pegada puede no traer ninguna pista: ni banco, ni marca, ni
    // plastico. Decir "no encontre una cuenta que corresponda a sin marca" es
    // cierto y no sirve para nada; lo que hay que decir es que no hay de donde
    // sacarlo y que la elija.
    const sinPistas =
      !identity.bank && !identity.brand && identity.cardsLast4.length === 0;
    return {
      error: sinPistas
        ? "Esta lista no dice de que tarjeta es: no trae banco, ni marca, ni numero de plastico. Elegi la cuenta a mano."
        : `Es un resumen ${inferida.label}, pero ` +
          (inferida.reason === "ambigua"
            ? "mas de una cuenta puede serlo. Elegila a mano."
            : "no encontre una cuenta que le corresponda. Elegila a mano o crea una en Cuentas."),
    };
  }

  const { data: imported, error: importError } = await supabase
    .from("imports")
    .insert({
      account_id: accountId,
      filename,
      period_close: periodClose,
      declared_total_ars: centsToNumeric(statement.declaredTotalArs),
      declared_total_usd: centsToNumeric(statement.declaredTotalUsd),
      computed_total_ars: centsToNumeric(statement.declaredTotalArs),
      computed_total_usd: centsToNumeric(statement.declaredTotalUsd),
      status: "reconciled",
      provisional,
      // Lo que el resumen dice de si mismo. Queda guardado para poder avisar en
      // la pantalla de revision si la cuenta que quedo no le corresponde.
      raw_extraction: { identity, inferred: inferida.accountId, via: inferida.via },
    })
    .select("id")
    .single();

  if (importError || !imported) {
    return { error: `No se pudo crear el import: ${importError?.message}` };
  }

  // La huella se calcula recien al confirmar: import_rows no la guarda, y
  // depende del monto ya normalizado.
  //
  // `outsideTotal` son filas que el total declarado no cubre (el pago en una
  // lista de consumos). Se transcriben igual, descartadas: que aparezcan en la
  // revision es la prueba de que la transcripcion esta completa.
  const rows = [...statement.rows, ...statement.outsideTotal].map((row) => {
    // La transcripcion es fiel: el pago del resumen y las transferencias se
    // guardan en staging porque hacen falta para que reconcilie. Pero no son
    // gastos, asi que nacen descartadas y nunca llegan a transactions.
    // El lector distingue impuestos, intereses y devoluciones porque los
    // necesita para clasificar bien el resumen; la app los colapsa a gasto o
    // cuota. Lo que el lector marca como no rastreable (el pago, las
    // devoluciones de percepcion) no se importa.
    const kind = row.tracked ? toExpenseKind(row.kind, row.cuotaCurrent) : null;
    const suggested = kind
      ? suggestCategory(row, (rules.data ?? []) as Rule[])
      : null;
    return {
      import_id: imported.id,
      line_no: row.lineNo,
      occurred_on: row.occurredOn,
      raw_description: row.rawDescription,
      amount: centsToNumeric(row.amount),
      currency: row.currency,
      kind: kind ?? row.kind,
      card_last4: row.cardLast4,
      cuota_current: row.cuotaCurrent,
      cuota_total: row.cuotaTotal,
      suggested_category_id: suggested,
      // Lo que ya sabemos categorizar no necesita revision manual.
      needs_review: kind !== null && suggested === null,
      status: (kind ? "pending" : "discarded") as "pending" | "discarded",
    };
  });

  const { error: rowsError } = await supabase.from("import_rows").insert(rows);
  if (rowsError) {
    await supabase.from("imports").delete().eq("id", imported.id);
    return { error: `No se pudieron guardar las filas: ${rowsError.message}` };
  }

  redirect(`/importar/${imported.id}`);
}

/**
 * Cambia a que cuenta corresponde un resumen.
 *
 * Es la otra mitad de inferir: la inferencia se puede corregir, y este es el
 * momento en que corregirla todavia es barato. Despues de confirmar ya no: los
 * movimientos estan escritos con su huella, y la cuenta es parte de la huella.
 */
export async function setImportAccount(formData: FormData) {
  const { supabase } = await requireUser();
  const importId = String(formData.get("import_id") ?? "");
  const accountId = String(formData.get("account_id") ?? "");
  if (!importId || !accountId) return;

  // La cuenta tiene que existir y ser tuya. El select pasa por RLS, asi que un
  // id ajeno no devuelve nada; la FK sola no alcanzaria para impedirlo.
  const { data: cuenta } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .single();
  if (!cuenta) return;

  await supabase
    .from("imports")
    .update({ account_id: accountId })
    .eq("id", importId)
    .neq("status", "committed");

  revalidatePath(`/importar/${importId}`);
}

/**
 * Categoriza una fila en la pantalla de revision.
 *
 * Acepta tambien una categoria nueva escrita ahi mismo: cortar la revision de
 * 40 filas para ir a crear "Seguros" en otra pantalla y volver a empezar es la
 * clase de friccion que hace que uno deje de usar la app.
 */
export async function setRowCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const rowId = String(formData.get("row_id") ?? "");
  if (!rowId) return;

  let categoryId = String(formData.get("category_id") ?? "");
  const nuevaCategoria = String(formData.get("new_category") ?? "").trim();

  if (nuevaCategoria) {
    // El kind lo fija la fila, no el usuario: una categoria de gasto creada
    // desde un consumo tiene que quedar como gasto o despues no aparece.
    const kind = String(formData.get("category_kind") ?? "expense");

    const { data: creada, error } = await supabase
      .from("categories")
      .insert({ name: nuevaCategoria, kind })
      .select("id")
      .single();

    if (creada) {
      categoryId = creada.id;
    } else if (error?.code === "23505") {
      // Ya existia con ese nombre: se reusa en vez de fallar.
      const { data: existente } = await supabase
        .from("categories")
        .select("id")
        .eq("name", nuevaCategoria)
        .single();
      if (!existente) return;
      categoryId = existente.id;
    } else {
      return;
    }
  }

  // El tipo tambien se puede corregir: el parser acierta casi siempre, pero un
  // impuesto leido como compra distorsiona el analisis por categoria.
  const enviado = String(formData.get("kind") ?? "");
  const { data: fila } = await supabase
    .from("import_rows")
    .select("kind, import_id, raw_description")
    .eq("id", rowId)
    .single();

  const kind: Kind = isKind(enviado) ? enviado : ((fila?.kind ?? "consumption") as Kind);

  // La categoria tiene que pertenecer a la familia del tipo. El formulario ya
  // filtra, pero una accion es alcanzable por POST directo y ademas el
  // formulario puede llegar con el tipo cambiado en la misma tanda: sin este
  // chequeo quedaban filas con kind "consumption" y categoria de "transfer",
  // que es un estado que no deberia poder existir.
  if (categoryId) {
    const { data: categoria } = await supabase
      .from("categories")
      .select("kind")
      .eq("id", categoryId)
      .single();

    if (!categoria || categoria.kind !== CATEGORY_KIND_FOR[kind]) {
      // Se guarda el tipo, pero la fila vuelve a pedir categoria en vez de
      // quedar imputada a una que no le corresponde.
      await supabase
        .from("import_rows")
        .update({ kind, suggested_category_id: null, needs_review: true })
        .eq("id", rowId);
      revalidatePath("/", "layout");
      return;
    }
  }

  // Cambiar el tipo a uno que no es gasto saca la fila del import: la app solo
  // registra gastos.
  const esGasto = isExpenseKind(kind);

  await supabase
    .from("import_rows")
    .update({
      suggested_category_id: esGasto ? categoryId || null : null,
      kind,
      needs_review: esGasto && !categoryId,
      status: esGasto ? "pending" : "discarded",
    })
    .eq("id", rowId);

  // Un comercio suele aparecer varias veces en el mismo resumen. Categorizar
  // uno alcanza a los demas que la regla resultante tambien tomaria el mes que
  // viene: aplicar ahora lo mismo que se va a aplicar despues es lo predecible,
  // y ahorra repetir el mismo click.
  if (esGasto && categoryId && fila?.import_id) {
    const patron = suggestPattern(String(fila.raw_description ?? ""));
    if (patron.length >= 3) {
      const { data: hermanas } = await supabase
        .from("import_rows")
        .select("id, raw_description")
        .eq("import_id", fila.import_id)
        .eq("needs_review", true);

      const alcanzadas = (hermanas ?? [])
        .filter((h) => normalizeMerchant(h.raw_description).includes(patron))
        .map((h) => h.id);

      if (alcanzadas.length > 0) {
        await supabase
          .from("import_rows")
          .update({ suggested_category_id: categoryId, needs_review: false })
          .in("id", alcanzadas);
      }
    }
  }

  revalidatePath("/", "layout");
}

/** Descarta una fila: no va a llegar a transactions. */
export async function discardRow(formData: FormData) {
  const { supabase } = await requireUser();
  const rowId = String(formData.get("row_id") ?? "");
  const importId = String(formData.get("import_id") ?? "");
  if (!rowId) return;

  await supabase
    .from("import_rows")
    .update({ status: "discarded", needs_review: false })
    .eq("id", rowId);

  revalidatePath(`/importar/${importId}`);
}

/**
 * Confirma el import: escribe en transactions y aprende las reglas.
 *
 * Es el unico camino de import_rows a transactions, y solo corre cuando no
 * queda nada por revisar.
 */
export async function commitImport(formData: FormData): Promise<void> {
  const { supabase } = await requireUser();
  const importId = String(formData.get("import_id") ?? "");
  if (!importId) return;

  const { data: imported } = await supabase
    .from("imports")
    .select("id, account_id, status, period_close, provisional, accounts!inner(is_liability)")
    .eq("id", importId)
    .single();
  if (!imported || imported.status === "committed") return;

  // Solo la tarjeta difiere el gasto: el resumen de agosto se paga en agosto,
  // aunque traiga compras de junio. Un extracto bancario no tiene esa demora,
  // asi que sus movimientos siguen cayendo por su propia fecha.
  const esTarjeta = Boolean(
    (imported.accounts as unknown as { is_liability: boolean } | null)?.is_liability,
  );
  const statementPeriod =
    esTarjeta && imported.period_close ? periodOfDate(imported.period_close) : null;

  const { data: rows } = await supabase
    .from("import_rows")
    .select("*")
    .eq("import_id", importId)
    .eq("status", "pending");

  const pending = (rows ?? []).sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0));
  if (pending.some((r) => r.needs_review)) return;

  // Lo provisorio de ese mes se reemplaza, no se acumula.
  //
  // Vale para los dos casos: el PDF real que llega y pisa lo que se habia
  // pegado, y un pegado nuevo a mitad de mes que pisa al anterior. Va antes del
  // insert a proposito: las filas que se repiten tienen la misma huella, y la
  // base rechazaria el import entero por duplicado en vez de reemplazarlo.
  let reemplazados = 0;
  if (statementPeriod) {
    const { count } = await supabase
      .from("transactions")
      .delete({ count: "exact" })
      .eq("account_id", imported.account_id)
      .eq("statement_period", statementPeriod)
      .eq("is_projected", true);
    reemplazados = count ?? 0;

    // Y el import provisorio que los dejo, para que la lista no se llene de
    // borradores del mismo mes. Sus import_rows caen por cascada.
    const { from, to } = periodRange(statementPeriod);
    await supabase
      .from("imports")
      .delete()
      .eq("account_id", imported.account_id)
      .eq("provisional", true)
      .neq("id", importId)
      .gte("period_close", from)
      .lte("period_close", to);
  }

  // Se arma primero la fila final (monto ya normalizado) y recien despues la
  // huella, para que se pueda recomputar desde lo guardado sin volver al PDF.
  const preparadas = pending.map((r) => {
    const kind = r.kind as Kind;
    return {
      accountId: imported.account_id,
      occurredOn: r.occurred_on!,
      amount: normalizeAmountForKind(Math.round(Number(r.amount) * 100), kind),
      currency: r.currency as Currency,
      description: r.raw_description,
      cardLast4: r.card_last4,
      cuotaCurrent: r.cuota_current,
      cuotaTotal: r.cuota_total,
      kind,
      categoryId: r.suggested_category_id,
    };
  });

  const fingerprinted = withFingerprints(preparadas);

  const { error } = await supabase.from("transactions").insert(
    fingerprinted.map((r) => ({
      account_id: r.accountId,
      category_id: r.categoryId,
      occurred_on: r.occurredOn,
      amount: centsToNumeric(r.amount),
      currency: r.currency,
      kind: r.kind,
      description: r.description,
      merchant_normalized: normalizeMerchant(r.description),
      card_last4: r.cardLast4,
      cuota_number: r.cuotaCurrent,
      import_id: importId,
      statement_period: statementPeriod,
      // Lo pegado del home banking es provisorio hasta que llegue el PDF.
      is_projected: imported.provisional,
      fingerprint: r.fingerprint,
    })),
  );

  if (error) {
    redirect(
      `/importar/${importId}?error=${encodeURIComponent(
        error.code === "23505"
          ? await explicarDuplicado(supabase, imported.account_id, statementPeriod)
          : error.message,
      )}`,
    );
  }

  // Cada correccion se convierte en regla, asi el proximo resumen se mapea solo.
  // Las cuotas tambien: antes quedaban afuera, y por eso una compra en cuotas
  // volvia a pedir categoria todos los meses aunque ya se hubiera categorizado.
  const nuevasReglas = new Map<string, string>();
  for (const r of pending) {
    if (!r.suggested_category_id) continue;
    if (!isExpenseKind(r.kind as Kind)) continue;
    const pattern = suggestPattern(r.raw_description);
    if (pattern.length >= 3) nuevasReglas.set(pattern, r.suggested_category_id);
  }
  if (nuevasReglas.size > 0) {
    await supabase.from("merchant_rules").upsert(
      [...nuevasReglas].map(([pattern, category_id]) => ({ pattern, category_id })),
      { onConflict: "user_id,pattern", ignoreDuplicates: true },
    );
  }

  await supabase
    .from("import_rows")
    .update({ status: "accepted" })
    .eq("import_id", importId)
    .eq("status", "pending");
  await supabase.from("imports").update({ status: "committed" }).eq("id", importId);

  revalidatePath("/", "layout");
  // Si se piso lo provisorio, se vuelve al mes que cambio y se dice cuanto se
  // reemplazo: borrar movimientos en silencio es justo lo que no hay que hacer.
  redirect(
    reemplazados > 0
      ? `/?mes=${statementPeriod}&reemplazo=${reemplazados}`
      : "/",
  );
}

/**
 * Por que la base rechazo el import por duplicado.
 *
 * "Ya fue importado antes" es cierto pero manda a buscar el problema al lugar
 * equivocado cuando la causa real es haber elegido mal el mes: el reemplazo de
 * lo provisorio busca por cuenta Y periodo, asi que con el mes cambiado no
 * encuentra nada que pisar y las mismas filas chocan contra sus propias
 * huellas. Corre solo en el camino de error, asi que no cuesta nada.
 */
async function explicarDuplicado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  statementPeriod: string | null,
): Promise<string> {
  const generico =
    "Este resumen ya fue importado antes: la base rechazo los movimientos repetidos.";
  if (!statementPeriod) return generico;

  const { data } = await supabase
    .from("transactions")
    .select("statement_period")
    .eq("account_id", accountId)
    .eq("is_projected", true)
    .neq("statement_period", statementPeriod)
    .not("statement_period", "is", null)
    .limit(50);

  const otros = [
    ...new Set((data ?? []).map((t) => t.statement_period as string)),
  ].sort();
  if (otros.length === 0) return generico;

  return (
    `Estos movimientos ya estan cargados como provisorios en ${otros.join(" y ")}, ` +
    `y los estas cargando en ${statementPeriod}. Si te equivocaste de mes, ` +
    "descarta este resumen y volve a pegarlo eligiendo el mes correcto: " +
    "cargado en el mes que corresponde, reemplaza al anterior en vez de chocar."
  );
}

/**
 * Borra un resumen y todo lo que genero: sus filas de staging y los
 * movimientos que se hayan confirmado a partir de el.
 *
 * Los movimientos se borran primero a proposito. La FK de transactions.import_id
 * es ON DELETE SET NULL, asi que borrar el import antes no los elimina: los
 * deja sueltos, sin forma de saber de donde salieron ni de volver a borrarlos.
 *
 * Las merchant_rules aprendidas NO se tocan. No son datos del resumen sino lo
 * que el sistema aprendio de tus correcciones, y perderlas obligaria a
 * recategorizar todo de nuevo.
 */
export async function deleteImport(formData: FormData) {
  const { supabase } = await requireUser();
  const importId = String(formData.get("import_id") ?? "");
  if (!importId) return;

  const { error: txError } = await supabase
    .from("transactions")
    .delete()
    .eq("import_id", importId);
  if (txError) {
    redirect(`/importar?error=${encodeURIComponent(
      `No se pudieron borrar los movimientos: ${txError.message}`,
    )}`);
  }

  // import_rows cae solo: su FK al import es ON DELETE CASCADE.
  const { error } = await supabase.from("imports").delete().eq("id", importId);
  if (error) {
    redirect(`/importar?error=${encodeURIComponent(
      `No se pudo borrar el resumen: ${error.message}`,
    )}`);
  }

  revalidatePath("/", "layout");
  redirect("/importar");
}
