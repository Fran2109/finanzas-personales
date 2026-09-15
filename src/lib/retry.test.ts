import { test } from "node:test";
import assert from "node:assert/strict";
import { isTransient, withRetry, retryDelayMs } from "./retry.ts";

test("distingue lo transitorio de lo que va a fallar siempre", () => {
  assert.equal(isTransient({ message: "Gateway Timeout" }), true);
  assert.equal(isTransient({ message: "fetch failed" }), true);
  assert.equal(isTransient({ message: "ECONNRESET" }), true);
  assert.equal(isTransient(null), false);
  // Permisos, constraints y sintaxis fallan igual en el proximo intento.
  assert.equal(isTransient({ message: "permission denied", code: "42501" }), false);
  assert.equal(isTransient({ message: "duplicate key", code: "23505" }), false);
  assert.equal(isTransient({ message: "no rows", code: "PGRST116" }), false);
});

test("reintenta y devuelve el resultado bueno", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) return { data: null, error: { message: "Gateway Timeout" } };
      return { data: ["ok"], error: null };
    },
    { baseDelayMs: 1 },
  );

  assert.equal(calls, 3);
  assert.deepEqual(result.data, ["ok"]);
  assert.equal(result.error, null);
});

test("se rinde despues del ultimo intento y conserva el error", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      return { data: null, error: { message: "Gateway Timeout" } };
    },
    { attempts: 3, baseDelayMs: 1 },
  );

  assert.equal(calls, 3);
  assert.equal(result.error?.message, "Gateway Timeout");
});

test("no reintenta lo que no es transitorio", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      return { data: null, error: { message: "permission denied", code: "42501" } };
    },
    { baseDelayMs: 1 },
  );

  assert.equal(calls, 1);
  assert.equal(result.error?.code, "42501");
});

test("una excepcion de red cuenta como intento fallido, no rompe", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("fetch failed");
      return { data: "listo", error: null };
    },
    { baseDelayMs: 1 },
  );

  assert.equal(calls, 2);
  assert.equal(result.data, "listo");
});

test("el desfasaje de reloj del token es transitorio", () => {
  // El token se emite con una marca apenas adelantada respecto del que lo
  // valida; unos milisegundos despues ya sirve.
  assert.equal(isTransient({ message: "JWT issued at future" }), true);
  assert.equal(isTransient({ message: "token not yet valid" }), true);
});

test("un token vencido o invalido no se reintenta", () => {
  // Esos no se arreglan esperando: reintentarlos solo demora el mismo error.
  assert.equal(isTransient({ message: "JWT expired" }), false);
  assert.equal(isTransient({ message: "invalid JWT signature" }), false);
  assert.equal(isTransient({ message: "invalid claim: missing sub" }), false);
});

test("un desfasaje de reloj espera segundos, no milisegundos", () => {
  // El error dice que el token todavia no es valido. Reintentar a los 150ms da
  // el mismo error las tres veces: lo unico que lo arregla es que pase el
  // tiempo. Un 504, en cambio, se reintenta enseguida.
  const skew = { message: "JWT issued at future" };
  const gateway = { message: "Gateway Timeout" };

  assert.equal(retryDelayMs(skew, 0, 150), 1000);
  assert.equal(retryDelayMs(skew, 1, 150), 2000);
  assert.equal(retryDelayMs(gateway, 0, 150), 150);
  assert.equal(retryDelayMs(gateway, 1, 150), 300);

  // Con tres intentos la ventana total pasa de 450ms a 3s.
  const total = (e: { message: string }) => retryDelayMs(e, 0, 150) + retryDelayMs(e, 1, 150);
  assert.equal(total(gateway), 450);
  assert.equal(total(skew), 3000);
});

test("sin error no se inventa una espera larga", () => {
  assert.equal(retryDelayMs(null, 0, 150), 150);
});

test("el desfasaje de reloj se reintenta mas veces que el resto", async () => {
  // Es el unico error de la lista que no se arregla reintentando rapido: el
  // token vale recien cuando el reloj que lo valida alcanza al iat. Con el
  // presupuesto de los demas (3 intentos, ~450ms) se rendia antes de tiempo.
  let corridas = 0;
  const resultado = await withRetry(
    async () => {
      corridas += 1;
      return { data: null, error: { message: "JWT issued at future" } };
    },
    { baseDelayMs: 0 },
  );
  assert.equal(corridas, 4, "cuatro intentos, no tres");
  assert.equal(resultado.error?.message, "JWT issued at future");
});

test("un error transitorio comun conserva su presupuesto", async () => {
  let corridas = 0;
  await withRetry(
    async () => {
      corridas += 1;
      return { data: null, error: { message: "gateway timeout" } };
    },
    { baseDelayMs: 0 },
  );
  assert.equal(corridas, 3);
});

test("el desfasaje que se resuelve no agota los intentos", async () => {
  let corridas = 0;
  const resultado = await withRetry(
    async () => {
      corridas += 1;
      return corridas < 3
        ? { data: null, error: { message: "JWT issued at future" } }
        : { data: "listo", error: null };
    },
    { baseDelayMs: 0 },
  );
  assert.equal(resultado.data, "listo");
  assert.equal(corridas, 3);
});
