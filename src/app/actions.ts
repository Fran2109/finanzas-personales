"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { parseAmountToCents, centsToNumeric, centsFromDb } from "@/lib/money";
import {
  CATEGORY_KIND_FOR,
  isAccountType,
  isCurrency,
  isExpenseKind,
  isKind,
  isPeriod,
  normalizeMerchant,
  periodOf,
  type Currency,
  type Kind,
} from "@/lib/domain";
import {
  fingerprintKey,
  fingerprintOf,
  type Fingerprintable,
} from "@/lib/import/fingerprint";
import { suggestPattern } from "@/lib/import/categorize";

export type FormState = { error?: string; ok?: string };

function fail(error: string): FormState {
  return { error };
}

/**
 * Toda Server Action es alcanzable por POST directo, no solo desde la UI. El
 * cliente de servidor va siempre con la sesion del usuario, asi que RLS es la
 * autorizacion real; este chequeo solo evita trabajo y da un error claro.
 */
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Sesion
// ---------------------------------------------------------------------------

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) return fail("Falta el mail o la contrasena.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return fail(
      error.message === "Invalid login credentials"
        ? "Mail o contrasena incorrectos."
        : error.message,
    );
  }

  redirect(next.startsWith("/") ? next : "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return fail("Minimo 8 caracteres.");
  if (password !== confirm) return fail("Las dos contrasenas no coinciden.");

  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(error.message);

  return { ok: "Contrasena actualizada." };
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

export async function createTransaction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireUser();

  const amountRaw = String(formData.get("amount") ?? "");
  const cents = parseAmountToCents(amountRaw);
  if (cents === null) return fail(`No entiendo el monto "${amountRaw}".`);
  if (cents === 0) return fail("El monto no puede ser cero.");
  if (cents < 0) {
    return fail("Carga el monto en positivo y elegi el tipo: el signo lo da el tipo.");
  }

  const accountId = String(formData.get("account_id") ?? "");
  if (!accountId) return fail("Elegi una cuenta.");

  const kind = String(formData.get("kind") ?? "");
  if (!isKind(kind)) return fail("Tipo de movimiento invalido.");

  const currency = String(formData.get("currency") ?? "ARS");
  if (!isCurrency(currency)) return fail("Moneda invalida.");

  const occurredOn = String(formData.get("occurred_on") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return fail("Fecha invalida.");

  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");
  const cardLast4 = String(formData.get("card_last4") ?? "").trim();

  if (cardLast4 && !/^\d{4}$/.test(cardLast4)) {
    return fail("Los ultimos 4 de la tarjeta son 4 digitos.");
  }

  const { error } = await supabase.from("finanzas_transactions").insert({
    account_id: accountId,
    category_id: categoryId || null,
    occurred_on: occurredOn,
    amount: centsToNumeric(cents),
    currency,
    kind,
    description: description || null,
    merchant_normalized: description ? normalizeMerchant(description) : null,
    card_last4: cardLast4 || null,
    // Sin fingerprint a proposito: es la red anti-duplicados de los imports.
    // A mano, dos cafes iguales el mismo dia son dos gastos, no un duplicado.
  });

  if (error) return fail(`No se pudo guardar: ${error.message}`);

  revalidatePath("/", "layout");
  return { ok: "Guardado." };
}

/**
 * Edita un movimiento ya cargado.
 *
 * Sirve para los dos origenes: los que se cargan a mano y los que vienen de un
 * resumen. Los de resumen tienen `fingerprint`, que es la red anti-duplicados,
 * y editarlos obliga a decidir que pasa con ella.
 *
 * La regla: **la huella siempre describe la fila guardada**. Si la edicion no
 * toca ninguno de sus campos —cambiar la categoria o el tipo, que es el 90% de
 * las ediciones— la huella queda intacta, y asi dos movimientos realmente
 * identicos del mismo resumen no se pisan entre si. Si toca alguno, se
 * recalcula, porque una huella que describe algo que ya no esta ahi no protege
 * de nada y ademas rompe el invariante de poder recomputarla desde la fila.
 *
 * El costo de recalcular es real y vale decirlo: un movimiento editado deja de
 * coincidir con su linea del resumen, asi que volver a importar ese mismo
 * resumen lo trae de nuevo. Es la consecuencia honesta de haberse apartado a
 * proposito de lo que decia el PDF.
 */
export async function updateTransaction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Falta el movimiento.");

  const { data: actual } = await supabase
    .from("finanzas_transactions")
    .select(
      "id, account_id, occurred_on, amount, currency, kind, description, card_last4, cuota_number, fingerprint",
    )
    .eq("id", id)
    .single();
  if (!actual) return fail("No encontre ese movimiento.");

  const amountRaw = String(formData.get("amount") ?? "");
  const cents = parseAmountToCents(amountRaw);
  if (cents === null) return fail(`No entiendo el monto "${amountRaw}".`);
  if (cents === 0) return fail("El monto no puede ser cero.");

  const accountId = String(formData.get("account_id") ?? "");
  if (!accountId) return fail("Elegi una cuenta.");

  const kind = String(formData.get("kind") ?? "");
  // Solo los dos tipos de gasto: la app no registra otra cosa.
  if (!isKind(kind) || !isExpenseKind(kind)) return fail("Tipo de movimiento invalido.");

  const currency = String(formData.get("currency") ?? "ARS");
  if (!isCurrency(currency)) return fail("Moneda invalida.");

  const occurredOn = String(formData.get("occurred_on") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return fail("Fecha invalida.");

  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");
  const cardLast4 = String(formData.get("card_last4") ?? "").trim();

  if (cardLast4 && !/^\d{4}$/.test(cardLast4)) {
    return fail("Los ultimos 4 de la tarjeta son 4 digitos.");
  }

  // La categoria tiene que pertenecer a la familia del tipo. El formulario ya
  // filtra, pero una Server Action es alcanzable por POST directo.
  if (categoryId) {
    const { data: categoria } = await supabase
      .from("finanzas_categories")
      .select("kind")
      .eq("id", categoryId)
      .single();
    if (!categoria || categoria.kind !== CATEGORY_KIND_FOR[kind as Kind]) {
      return fail("Esa categoria no corresponde a ese tipo de movimiento.");
    }
  }

  // Un gasto que no es cuota no tiene numero de cuota.
  const cuotaNumber = kind === "installment" ? actual.cuota_number : null;

  const antes: Fingerprintable = {
    accountId: actual.account_id,
    occurredOn: actual.occurred_on,
    amount: centsFromDb(actual.amount),
    currency: actual.currency as Currency,
    description: actual.description ?? "",
    cardLast4: actual.card_last4,
    cuotaCurrent: actual.cuota_number,
  };
  const despues: Fingerprintable = {
    accountId,
    occurredOn,
    amount: cents,
    currency,
    description,
    cardLast4: cardLast4 || null,
    cuotaCurrent: cuotaNumber,
  };

  const fingerprint =
    actual.fingerprint === null
      ? null
      : fingerprintKey(antes) === fingerprintKey(despues)
        ? actual.fingerprint
        : fingerprintOf(despues, 0);

  const { error } = await supabase
    .from("finanzas_transactions")
    .update({
      account_id: accountId,
      category_id: categoryId || null,
      occurred_on: occurredOn,
      amount: centsToNumeric(cents),
      currency,
      kind,
      description: description || null,
      merchant_normalized: description ? normalizeMerchant(description) : null,
      card_last4: cardLast4 || null,
      cuota_number: cuotaNumber,
      fingerprint,
    })
    .eq("id", id);

  if (error) {
    return fail(
      error.code === "23505"
        ? "Con esos datos queda igual a otro movimiento que vino del mismo resumen, y la base no admite dos huellas iguales."
        : `No se pudo guardar: ${error.message}`,
    );
  }

  // Ensenar el comercio es opcional y apagado por defecto: corregir la
  // categoria de UN movimiento no siempre quiere decir que el comercio entero
  // este mal clasificado, y retrainear sin preguntar arruinaria el proximo
  // resumen en silencio.
  let aprendido = "";
  if (formData.get("learn") === "on" && categoryId && description) {
    const pattern = suggestPattern(description);
    if (pattern.length >= 3) {
      // Sin ignoreDuplicates: si ya habia una regla para ese comercio y es la
      // que fallo, lo que se quiere es corregirla, no dejarla como estaba.
      const { error: ruleError } = await supabase
        .from("finanzas_merchant_rules")
        .upsert({ pattern, category_id: categoryId }, { onConflict: "user_id,pattern" });
      if (!ruleError) aprendido = ` "${pattern}" se va a categorizar asi de ahora en mas.`;
    }
  }

  revalidatePath("/", "layout");
  return { ok: `Guardado.${aprendido}` };
}

export async function deleteTransaction(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase.from("finanzas_transactions").delete().eq("id", id);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

export async function createAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Ponele un nombre.");

  const type = String(formData.get("type") ?? "");
  if (!isAccountType(type)) return fail("Tipo de cuenta invalido.");

  const currency = String(formData.get("currency") ?? "ARS");
  if (!isCurrency(currency)) return fail("Moneda invalida.");

  const { error } = await supabase.from("finanzas_accounts").insert({
    name,
    type,
    currency,
    is_liability: type === "credit_card",
  });

  if (error) {
    return fail(
      error.code === "23505"
        ? `Ya existe una cuenta que se llama "${name}".`
        : `No se pudo crear: ${error.message}`,
    );
  }

  revalidatePath("/", "layout");
  return { ok: `Cuenta "${name}" creada.` };
}

export async function updateAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Falta la cuenta.");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Ponele un nombre.");

  const type = String(formData.get("type") ?? "");
  if (!isAccountType(type)) return fail("Tipo de cuenta invalido.");

  const currency = String(formData.get("currency") ?? "ARS");
  if (!isCurrency(currency)) return fail("Moneda invalida.");

  const { error } = await supabase
    .from("finanzas_accounts")
    .update({
      name,
      type,
      currency,
      // Se deriva del tipo y no se edita aparte: es lo que decide el signo de
      // cada movimiento sobre el saldo, y un valor incoherente con el tipo
      // daria saldos al reves.
      is_liability: type === "credit_card",
    })
    .eq("id", id);

  if (error) {
    return fail(
      error.code === "23505"
        ? `Ya existe una cuenta que se llama "${name}".`
        : `No se pudo guardar: ${error.message}`,
    );
  }

  revalidatePath("/", "layout");
  return { ok: "Cuenta actualizada." };
}

/**
 * Baja de una cuenta.
 *
 * Una cuenta con movimientos no se borra: la FK de transactions es
 * ON DELETE RESTRICT justamente para que el historial no se evapore por un
 * click. Para eso esta archivar, que la saca del paso sin perder nada.
 *
 * Los resumenes importados si caen con la cuenta (FK en cascada), asi que se
 * avisa cuantos son antes de confirmar.
 */
export async function deleteAccount(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { count } = await supabase
    .from("finanzas_transactions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id);

  if ((count ?? 0) > 0) {
    redirect(
      `/cuentas?error=${encodeURIComponent(
        `Esa cuenta tiene ${count} movimientos. Archivala en vez de borrarla: ` +
          `borrarla se llevaria el historial.`,
      )}`,
    );
  }

  const { error } = await supabase.from("finanzas_accounts").delete().eq("id", id);
  if (error) {
    redirect(`/cuentas?error=${encodeURIComponent(`No se pudo borrar: ${error.message}`)}`);
  }

  revalidatePath("/", "layout");
  redirect("/cuentas");
}

export async function setAccountActive(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await supabase.from("finanzas_accounts").update({ active }).eq("id", id);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Navegacion del mes
// ---------------------------------------------------------------------------

export async function goToPeriod(formData: FormData) {
  const period = String(formData.get("period") ?? "");
  redirect(isPeriod(period) ? `/?mes=${period}` : `/?mes=${periodOf(new Date())}`);
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export async function createCategory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Ponele un nombre.");

  // Solo las familias que un gasto puede usar: la app no registra ingresos ni
  // transferencias, asi que una categoria de esas no tendria con que usarse.
  const kind = String(formData.get("kind") ?? "expense");
  if (!["expense", "tax_fee", "financing"].includes(kind)) {
    return fail("Tipo de categoria invalido.");
  }

  const { error } = await supabase.from("finanzas_categories").insert({ name, kind });
  if (error) {
    return fail(
      error.code === "23505"
        ? `Ya existe una categoria "${name}".`
        : `No se pudo crear: ${error.message}`,
    );
  }

  revalidatePath("/", "layout");
  return { ok: `Categoria "${name}" creada.` };
}

export async function deleteCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase.from("finanzas_categories").delete().eq("id", id);
  revalidatePath("/", "layout");
}
