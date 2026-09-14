"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { parseAmountToCents, centsToNumeric } from "@/lib/money";
import {
  isAccountType,
  isCurrency,
  isKind,
  isPeriod,
  normalizeMerchant,
  periodOf,
} from "@/lib/domain";

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

  const { error } = await supabase.from("transactions").insert({
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

export async function deleteTransaction(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase.from("transactions").delete().eq("id", id);
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

  const { error } = await supabase.from("accounts").insert({
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

export async function setAccountActive(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await supabase.from("accounts").update({ active }).eq("id", id);
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

  const kind = String(formData.get("kind") ?? "expense");
  if (!["expense", "income", "tax_fee", "financing", "transfer"].includes(kind)) {
    return fail("Tipo de categoria invalido.");
  }

  const { error } = await supabase.from("categories").insert({ name, kind });
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
  await supabase.from("categories").delete().eq("id", id);
  revalidatePath("/", "layout");
}
