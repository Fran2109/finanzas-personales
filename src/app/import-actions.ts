"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/retry";
import { normalizeMerchant } from "@/lib/domain";
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

/** Categoriza una fila en la pantalla de revision. */
export async function setRowCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const rowId = String(formData.get("row_id") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const importId = String(formData.get("import_id") ?? "");
  if (!rowId) return;

  await supabase
    .from("import_rows")
    .update({
      suggested_category_id: categoryId || null,
      needs_review: false,
      status: "pending",
    })
    .eq("id", rowId);

  revalidatePath(`/importar/${importId}`);
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
      amount: r.amount,
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

/** Borra un import que todavia no se confirmo. */
export async function deleteImport(formData: FormData) {
  const { supabase } = await requireUser();
  const importId = String(formData.get("import_id") ?? "");
  if (!importId) return;
  await supabase.from("imports").delete().eq("id", importId).neq("status", "committed");
  revalidatePath("/importar");
  redirect("/importar");
}
