/**
 * A que cuenta corresponde un resumen.
 *
 * Elegir la cuenta a mano en cada carga es la clase de paso que uno hace en
 * automatico hasta el dia que se equivoca: un resumen de Supervielle imputado a
 * Galicia no falla ni rompe la reconciliacion —el gate compara la suma del PDF
 * contra su propio total, no contra la cuenta—, solo ensucia los totales y las
 * huellas en silencio. Asi que se infiere, y la inferencia se puede corregir
 * antes de confirmar.
 *
 * Dos senales, en orden de confianza:
 *
 * 1. **El plastico.** Si la tarjeta 1234 ya dejo movimientos en una cuenta, el
 *    resumen que la trae es de esa cuenta. Es un hecho observado, no una
 *    heuristica, y funciona con cualquier nombre de cuenta.
 * 2. **El nombre.** Banco + marca contra el nombre normalizado de la cuenta.
 *    Es lo unico que hay para el primer resumen de una tarjeta.
 *
 * Si ninguna decide sola, no se adivina: se pregunta.
 */

import { normalizeMerchant } from "../domain.ts";
import { BANK_LABELS, type Bank } from "./detect.ts";

/** Marca de la tarjeta. La red, no el banco: "VISA", no "Galicia". */
export type Network = "VISA" | "MASTERCARD" | "AMEX";

// Se matchea sobre texto ya normalizado (mayusculas, solo alfanumerico y
// espacios), por eso \b alcanza. "MASTER" y "MC" entran porque una cuenta que
// uno nombra a mano rara vez dice "MasterCard" completo.
const NETWORK_PATTERNS: [Network, RegExp][] = [
  ["MASTERCARD", /\b(MASTERCARD|MASTER|MC)\b/],
  ["VISA", /\bVISA\b/],
  ["AMEX", /\b(AMEX|AMERICAN EXPRESS)\b/],
];

/** Que red nombra un texto, si nombra alguna. */
export function networkOf(text: string | null | undefined): Network | null {
  if (!text) return null;
  const n = normalizeMerchant(text);
  for (const [network, re] of NETWORK_PATTERNS) {
    if (re.test(n)) return network;
  }
  return null;
}

/** Que banco nombra un texto, si nombra alguno conocido. */
export function bankOf(text: string | null | undefined): Bank | null {
  if (!text) return null;
  const n = normalizeMerchant(text);
  for (const bank of Object.keys(BANK_LABELS) as Bank[]) {
    if (new RegExp(`\\b${normalizeMerchant(BANK_LABELS[bank])}\\b`).test(n)) return bank;
  }
  return null;
}

/** Lo que el resumen dice de si mismo, que es todo con lo que se cuenta. */
export type StatementIdentity = {
  bank: Bank;
  /** Cabecera del resumen: "VISA", "MASTERCARD GOLD", "SUPERVIELLE VISA". */
  brand: string | null;
  /** Los plasticos que aparecen en el resumen. */
  cardsLast4: string[];
};

export type AccountLike = { id: string; name: string };

/** Plastico que ya dejo movimientos en una cuenta. */
export type KnownCard = { cardLast4: string; accountId: string };

export type AccountMatch = {
  /** La cuenta inferida, o null si no se pudo decidir. */
  accountId: string | null;
  /** De donde salio: el plastico ya visto, o el nombre de la cuenta. */
  via: "historial" | "nombre" | null;
  /** Por que no se pudo decidir. */
  reason: "sin-candidatas" | "ambigua" | null;
  /** Como describir el resumen en un mensaje: "Galicia VISA". */
  label: string;
};

/** "Galicia VISA" / "Supervielle MASTERCARD" / "Galicia". */
export function statementLabel(identity: StatementIdentity): string {
  const network = networkOf(identity.brand);
  return [BANK_LABELS[identity.bank], network].filter(Boolean).join(" ");
}

export function matchAccount(
  identity: StatementIdentity,
  accounts: AccountLike[],
  knownCards: KnownCard[] = [],
): AccountMatch {
  const label = statementLabel(identity);
  const base = { accountId: null, via: null, label } as const;
  if (accounts.length === 0) return { ...base, reason: "sin-candidatas" };

  const byId = new Set(accounts.map((a) => a.id));

  // 1. El plastico. Un mismo resumen puede traer varios —dos plasticos que se
  //    pagan con un solo pago son una sola cuenta—, pero si apuntan a cuentas
  //    distintas la historia se contradice y no hay nada que inferir.
  const enElResumen = new Set(identity.cardsLast4.filter(Boolean));
  const porHistorial = new Set(
    knownCards
      .filter((c) => enElResumen.has(c.cardLast4) && byId.has(c.accountId))
      .map((c) => c.accountId),
  );
  if (porHistorial.size === 1) {
    return { accountId: [...porHistorial][0], via: "historial", reason: null, label };
  }
  if (porHistorial.size > 1) return { ...base, reason: "ambigua" };

  // 2. El nombre: banco y marca tienen que coincidir los dos.
  const network = networkOf(identity.brand);
  const mismoBanco = accounts.filter((a) => bankOf(a.name) === identity.bank);

  if (network) {
    const exactas = mismoBanco.filter((a) => networkOf(a.name) === network);
    if (exactas.length === 1) return { accountId: exactas[0].id, via: "nombre", reason: null, label };
    if (exactas.length > 1) return { ...base, reason: "ambigua" };
  }

  // Una sola cuenta del banco y sin marca en el nombre ("Supervielle") no
  // contradice nada: es la unica lectura posible.
  const sinMarca = mismoBanco.filter((a) => networkOf(a.name) === null);
  if (sinMarca.length === 1) return { accountId: sinMarca[0].id, via: "nombre", reason: null, label };

  return { ...base, reason: mismoBanco.length === 0 ? "sin-candidatas" : "ambigua" };
}

/**
 * Si la cuenta elegida contradice al resumen.
 *
 * Solo habla cuando hay conflicto explicito —la cuenta nombra otro banco u otra
 * marca—, nunca por ausencia: una cuenta llamada "Tarjeta principal" no
 * contradice nada y elegirla es perfectamente valido.
 */
export function accountConflict(
  identity: StatementIdentity,
  accountName: string,
): string | null {
  const banco = bankOf(accountName);
  if (banco && banco !== identity.bank) {
    return `El resumen es de ${BANK_LABELS[identity.bank]} y la cuenta es de ${BANK_LABELS[banco]}.`;
  }

  const delResumen = networkOf(identity.brand);
  const deLaCuenta = networkOf(accountName);
  if (delResumen && deLaCuenta && delResumen !== deLaCuenta) {
    return `El resumen es ${delResumen} y la cuenta es ${deLaCuenta}.`;
  }

  return null;
}
