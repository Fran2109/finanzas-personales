import { test } from "node:test";
import assert from "node:assert/strict";

import {
  accountConflict,
  bankOf,
  matchAccount,
  networkOf,
  statementLabel,
  type AccountLike,
  type StatementIdentity,
} from "./match-account.ts";

// Nombres inventados, con la forma que uno le pone a una cuenta de verdad.
const CUENTAS: AccountLike[] = [
  { id: "gal-visa", name: "Galicia - Visa" },
  { id: "gal-mc", name: "Galicia - MasterCard" },
  { id: "sup-visa", name: "Supervielle VISA" },
  { id: "banco", name: "Caja de ahorro" },
];

function resumen(over: Partial<StatementIdentity> = {}): StatementIdentity {
  return { bank: "galicia", brand: "VISA", cardsLast4: [], ...over };
}

test("reconoce la red aunque la cuenta la escriba corta", () => {
  assert.equal(networkOf("MASTERCARD GOLD"), "MASTERCARD");
  assert.equal(networkOf("Galicia - MasterCard"), "MASTERCARD");
  assert.equal(networkOf("Galicia Master"), "MASTERCARD");
  assert.equal(networkOf("SUPERVIELLE VISA"), "VISA");
  assert.equal(networkOf("Caja de ahorro"), null);
  assert.equal(networkOf(null), null);
});

test("reconoce el banco por el nombre de la cuenta", () => {
  assert.equal(bankOf("Galicia - Visa"), "galicia");
  assert.equal(bankOf("Supervielle VISA"), "supervielle");
  assert.equal(bankOf("Caja de ahorro"), null);
});

test("VISA y MASTERCARD del mismo banco no se confunden", () => {
  assert.deepEqual(matchAccount(resumen(), CUENTAS), {
    accountId: "gal-visa",
    via: "nombre",
    reason: null,
    label: "Galicia VISA",
  });

  const mc = matchAccount(resumen({ brand: "MASTERCARD GOLD" }), CUENTAS);
  assert.equal(mc.accountId, "gal-mc");
  assert.equal(mc.label, "Galicia MASTERCARD");
});

test("el banco del resumen manda sobre la marca", () => {
  // La marca del resumen de Supervielle trae el nombre del banco adelante, y
  // aun asi tiene que caer en la cuenta de Supervielle y no en la de Galicia.
  const m = matchAccount(
    resumen({ bank: "supervielle", brand: "SUPERVIELLE VISA" }),
    CUENTAS,
  );
  assert.equal(m.accountId, "sup-visa");
  assert.equal(m.label, "Supervielle VISA");
});

test("el plastico ya visto gana sobre el nombre", () => {
  // Una cuenta que no nombra ni banco ni marca igual se infiere si ya recibio
  // movimientos de ese plastico.
  const cuentas = [...CUENTAS, { id: "otra", name: "Tarjeta principal" }];
  const m = matchAccount(resumen({ cardsLast4: ["1234", "5678"] }), cuentas, [
    { cardLast4: "1234", accountId: "otra" },
    { cardLast4: "5678", accountId: "otra" },
  ]);
  assert.equal(m.accountId, "otra");
  assert.equal(m.via, "historial");
});

test("si el historial se contradice no se adivina", () => {
  const m = matchAccount(resumen({ cardsLast4: ["1234", "5678"] }), CUENTAS, [
    { cardLast4: "1234", accountId: "gal-visa" },
    { cardLast4: "5678", accountId: "gal-mc" },
  ]);
  assert.equal(m.accountId, null);
  assert.equal(m.reason, "ambigua");
});

test("un plastico de una cuenta que ya no existe no decide nada", () => {
  const m = matchAccount(resumen({ brand: null, cardsLast4: ["1234"] }), CUENTAS, [
    { cardLast4: "1234", accountId: "borrada" },
  ]);
  // Cae al nombre: sin marca en el resumen, dos cuentas Galicia empatan.
  assert.equal(m.accountId, null);
  assert.equal(m.reason, "ambigua");
});

test("una sola cuenta del banco sin marca en el nombre alcanza", () => {
  const cuentas: AccountLike[] = [{ id: "sup", name: "Supervielle" }];
  const m = matchAccount(resumen({ bank: "supervielle", brand: "SUPERVIELLE VISA" }), cuentas);
  assert.equal(m.accountId, "sup");
  assert.equal(m.via, "nombre");
});

test("sin ninguna cuenta del banco no infiere", () => {
  const m = matchAccount(resumen({ bank: "supervielle", brand: "SUPERVIELLE VISA" }), [
    { id: "gal-visa", name: "Galicia - Visa" },
  ]);
  assert.equal(m.accountId, null);
  assert.equal(m.reason, "sin-candidatas");
});

test("dos cuentas que dicen lo mismo empatan en vez de elegir la primera", () => {
  const m = matchAccount(resumen(), [
    { id: "a", name: "Galicia Visa" },
    { id: "b", name: "Galicia Visa vieja" },
  ]);
  assert.equal(m.accountId, null);
  assert.equal(m.reason, "ambigua");
});

test("el conflicto habla del banco y de la marca, y se calla si no lo hay", () => {
  assert.match(
    accountConflict(resumen({ bank: "supervielle" }), "Galicia - Visa")!,
    /Supervielle.*Galicia/,
  );
  assert.match(accountConflict(resumen(), "Galicia - MasterCard")!, /VISA.*MASTERCARD/);
  assert.equal(accountConflict(resumen(), "Galicia - Visa"), null);
  // Una cuenta que no nombra nada no contradice nada.
  assert.equal(accountConflict(resumen(), "Tarjeta principal"), null);
});

test("el label sirve para un mensaje aunque falte la marca", () => {
  assert.equal(statementLabel(resumen({ brand: null })), "Galicia");
});
