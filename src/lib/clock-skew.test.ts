import { test } from "node:test";
import assert from "node:assert/strict";

import { issuedAtMs, msUntilValid, TOPE_ESPERA_MS } from "./clock-skew.ts";

/** Un token con el payload que haga falta. La firma no se mira. */
function token(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `cabecera.${b64}.firma`;
}

test("un token ya valido no hace esperar nada", () => {
  const ahora = 1_700_000_000_000;
  assert.equal(msUntilValid(token({ iat: ahora / 1000 - 5 }), ahora), 0);
});

test("un token emitido en el futuro hace esperar hasta que valga", () => {
  const ahora = 1_700_000_000_000;
  // Emitido 2 segundos adelante: se espera eso mas el margen del empate.
  const espera = msUntilValid(token({ iat: ahora / 1000 + 2 }), ahora);
  assert.ok(espera > 2000 && espera <= 2500, `espero ${espera}ms`);
});

test("la espera tiene tope", () => {
  // Medio minuto de desfasaje no es un redondeo de relojes: dormir todo eso
  // para fallar igual es peor que fallar rapido.
  const ahora = 1_700_000_000_000;
  assert.equal(msUntilValid(token({ iat: ahora / 1000 + 30 }), ahora), TOPE_ESPERA_MS);
});

test("un token ilegible no frena nada", () => {
  // No es asunto de este modulo: el error real lo da la consulta, con su
  // mensaje, que dice mas que uno inventado aca.
  assert.equal(msUntilValid("no-es-un-jwt"), 0);
  assert.equal(msUntilValid("a.no-es-base64-valido!!.c"), 0);
  assert.equal(issuedAtMs(token({ sub: "alguien" })), null, "sin iat no hay nada que leer");
});
