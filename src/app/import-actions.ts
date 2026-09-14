"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/retry";
import {
  CATEGORY_KIND_FOR,
  isKind,
  normalizeAmountForKind,
  normalizeMerchant,
  type Kind,
} from "@/lib/domain";
import { centsToNumeric } from "@/lib/money";
import { extractPdfText } from "@/lib/import/pdf";
import { parseGaliciaStatement } from "@/lib/import/galicia";
import { reconcile } from "@/lib/import/reconcile";
import { withFingerprints } from "@/lib/import/fingerprint";
import type { ParsedRow } from "@/lib/import/types";
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
 * Sube un resumen, lo lee y lo deja en staging.
 *
 * La reconciliacion es un gate, no un warning: si no cierra al centavo no se
 * escribe absolutamente nada y el import se rechaza entero.
 */
export async function uploadStatement(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireUser();

  const accountId = String(formData.get("account_id") ?? "");
  if (!accountId) return { error: "Elegi a que cuenta corresponde el resumen." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Subi el PDF del resumen." };
  if (file.size > MAX_PDF_BYTES) return { error: "El PDF no puede pesar mas de 10 MB." };

  let text: string;
  try {
    text = await extractPdfText(await file.arrayBuffer());
  } catch (e) {
    return { error: `No se pudo leer el PDF: ${e instanceof Error ? e.message : e}` };
  }

  const statement = parseGaliciaStatement(text);
  const check = reconcile(statement);

  if (!check.ok) {
    // Falla ruidosa a proposito. Nada llega a la base.
    return {
      error:
        "El resumen no reconcilia, asi que no se importo nada:\n" +
        check.problems.map((p) => `- ${p}`).join("\n"),
    };
  }

  const [rules, categories] = await Promise.all([
    withRetry(() => supabase.from("merchant_rules").select("id, pattern, category_id")),
    withRetry(() => supabase.from("categories").select("id, kind")),
  ]);
  if (rules.error) return { error: `No se pudieron leer las reglas: ${rules.error.message}` };
  if (categories.error) return { error: `No se pudieron leer las categorias: ${categories.error.message}` };

  const { data: imported, error: importError } = await supabase
    .from("imports")
    .insert({
      account_id: accountId,
      filename: file.name,
      period_close: statement.periodClose,
      declared_total_ars: centsToNumeric(statement.declaredTotalArs),
      declared_total_usd: centsToNumeric(statement.declaredTotalUsd),
      computed_total_ars: centsToNumeric(statement.declaredTotalArs),
      computed_total_usd: centsToNumeric(statement.declaredTotalUsd),
      status: "reconciled",
    })
    .select("id")
    .single();

  if (importError || !imported) {
    return { error: `No se pudo crear el import: ${importError?.message}` };
  }

  const rows = withFingerprints(statement.rows).map((row) => {
    const suggested = suggestCategory(row, (rules.data ?? []) as Rule[], categories.data ?? []);
    return {
      import_id: imported.id,
      line_no: row.lineNo,
      occurred_on: row.occurredOn,
      raw_description: row.rawDescription,
      amount: centsToNumeric(row.amount),
      currency: row.currency,
      kind: row.kind,
      card_last4: row.cardLast4,
      cuota_current: row.cuotaCurrent,
      cuota_total: row.cuotaTotal,
      suggested_category_id: suggested,
      // Lo que ya sabemos categorizar no necesita revision manual.
      needs_review: suggested === null && row.kind !== "payment",
      status: "pending" as const,
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
    .select("kind")
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

  await supabase
    .from("import_rows")
    .update({
      suggested_category_id: categoryId || null,
      kind,
      // Un pago de tarjeta no necesita categoria; el resto si.
      needs_review: !categoryId && kind !== "payment",
      status: "pending",
    })
    .eq("id", rowId);

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
    .select("id, account_id, status")
    .eq("id", importId)
    .single();
  if (!imported || imported.status === "committed") return;

  const { data: rows } = await supabase
    .from("import_rows")
    .select("*")
    .eq("import_id", importId)
    .eq("status", "pending");

  const pending = (rows ?? []).sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0));
  if (pending.some((r) => r.needs_review)) return;

  // La huella se recalcula aca: import_rows no la guarda, pero tiene todo lo
  // que hace falta. Es la red anti-duplicados, asi que no puede ir en null.
  const fingerprinted = withFingerprints(
    pending.map<ParsedRow>((r) => ({
      lineNo: r.line_no ?? 0,
      occurredOn: r.occurred_on!,
      rawDescription: r.raw_description,
      amount: Math.round(Number(r.amount) * 100),
      currency: r.currency as ParsedRow["currency"],
      kind: r.kind as ParsedRow["kind"],
      cardLast4: r.card_last4,
      cuotaCurrent: r.cuota_current,
      cuotaTotal: r.cuota_total,
    })),
  );

  const { error } = await supabase.from("transactions").insert(
    pending.map((r, i) => ({
      account_id: imported.account_id,
      category_id: r.suggested_category_id,
      occurred_on: r.occurred_on,
      // El resumen imprime pagos y devoluciones en negativo y el importador los
      // transcribe asi para reconciliar. Al escribir en transactions se pasan a
      // la convencion del saldo, o el signo se invertiria dos veces.
      amount: centsToNumeric(
        normalizeAmountForKind(Math.round(Number(r.amount) * 100), r.kind as Kind),
      ),
      currency: r.currency,
      kind: r.kind,
      description: r.raw_description,
      merchant_normalized: normalizeMerchant(r.raw_description),
      card_last4: r.card_last4,
      cuota_number: r.cuota_current,
      import_id: importId,
      fingerprint: fingerprinted[i].fingerprint,
    })),
  );

  if (error) {
    const msg =
      error.code === "23505"
        ? "Este resumen ya fue importado antes: la base rechazo los movimientos repetidos."
        : error.message;
    redirect(`/importar/${importId}?error=${encodeURIComponent(msg)}`);
  }

  // Cada correccion se convierte en regla, asi el proximo resumen se mapea solo.
  const nuevasReglas = new Map<string, string>();
  for (const r of pending) {
    if (!r.suggested_category_id) continue;
    if (r.kind !== "consumption" && r.kind !== "refund") continue;
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
  redirect("/");
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
