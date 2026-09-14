import { test } from "node:test";
import assert from "node:assert/strict";
import { withFingerprints, type Fingerprintable } from "./fingerprint.ts";

const base: Fingerprintable = {
  accountId: "cuenta-1",
  occurredOn: "2026-06-26",
  amount: 8810000,
  currency: "ARS",
  description: "COMERCIO EJEMPLO",
  cardLast4: "1234",
  cuotaCurrent: null,
};

test("el mismo movimiento da siempre la misma huella", () => {
  const [a] = withFingerprints([{ ...base }]);
  const [b] = withFingerprints([{ ...base }]);
  assert.equal(a.fingerprint, b.fingerprint);
});

test("dos cuotas del mismo plan no son duplicados", () => {
  // Comparten fecha de compra, monto y descripcion: lo unico que las distingue
  // es el numero de cuota. Sin el, el resumen del mes siguiente se rechazaba
  // entero al llegar la cuota 2 de una compra ya importada.
  const [uno] = withFingerprints([{ ...base, cuotaCurrent: 1 }]);
  const [dos] = withFingerprints([{ ...base, cuotaCurrent: 2 }]);
  assert.notEqual(uno.fingerprint, dos.fingerprint);
});

test("la misma cuota dos veces si es un duplicado", () => {
  const [a] = withFingerprints([{ ...base, cuotaCurrent: 2 }]);
  const [b] = withFingerprints([{ ...base, cuotaCurrent: 2 }]);
  assert.equal(a.fingerprint, b.fingerprint);
});

test("el mismo consumo en dos cuentas son dos movimientos", () => {
  const [a] = withFingerprints([{ ...base, accountId: "cuenta-1" }]);
  const [b] = withFingerprints([{ ...base, accountId: "cuenta-2" }]);
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test("dos movimientos identicos en el mismo resumen se numeran", () => {
  // Dos peajes iguales el mismo dia son dos gastos, no un duplicado.
  const [a, b] = withFingerprints([{ ...base }, { ...base }]);
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test("cambiar fecha, monto, moneda o plastico cambia la huella", () => {
  const [ref] = withFingerprints([{ ...base }]);
  for (const variante of [
    { occurredOn: "2026-06-27" },
    { amount: 8810001 },
    { currency: "USD" as const },
    { cardLast4: "9999" },
    { description: "OTRO COMERCIO" },
  ]) {
    const [otro] = withFingerprints([{ ...base, ...variante }]);
    assert.notEqual(otro.fingerprint, ref.fingerprint, JSON.stringify(variante));
  }
});
