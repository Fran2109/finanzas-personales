import { test } from "node:test";
import assert from "node:assert/strict";
import { isTransient, withRetry } from "./retry.ts";

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
