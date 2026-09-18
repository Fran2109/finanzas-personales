import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintKey, withFingerprints, type Fingerprintable } from "./fingerprint.ts";

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

test("la misma tanda dos veces da las mismas huellas, duplicados incluidos", () => {
  // De esto depende que heredar la nota al reemplazar lo provisorio funcione:
  // volver a pegar la misma tabla tiene que emparejar fila con fila. El caso
  // que importa son los duplicados, porque ahi la huella no sale solo de la
  // fila sino de cuantas iguales vinieron antes en la lista.
  const tanda = [
    { ...base },
    { ...base, description: "OTRO" },
    { ...base },
    { ...base },
  ];
  assert.deepEqual(
    withFingerprints(tanda).map((r) => r.fingerprint),
    withFingerprints(tanda).map((r) => r.fingerprint),
  );
});

test("el orden de la tanda decide la huella de los duplicados", () => {
  // La contracara del test anterior, y el limite que hay que conocer: el `seq`
  // sale de la posicion, asi que dos tandas con las mismas filas en distinto
  // orden no emparejan. Por eso `pending` se ordena por `line_no` antes de
  // calcular nada — sin ese orden, heredar notas seria una loteria.
  const a = withFingerprints([{ ...base }, { ...base, description: "OTRO" }, { ...base }]);
  const b = withFingerprints([{ ...base }, { ...base }, { ...base, description: "OTRO" }]);
  assert.notEqual(a[2].fingerprint, b[2].fingerprint);
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

// La huella y la edicion de movimientos
// ---------------------------------------------------------------------------
// `updateTransaction` decide si recalcular la huella comparando estas claves.
// Si la clave no cambia, la huella no se toca; eso es lo que permite editar la
// categoria de uno de dos movimientos identicos sin que choque con su gemelo.

test("editar lo que no esta en la huella no cambia la clave", () => {
  // La categoria y el tipo no forman parte de la huella, asi que cambiarlos no
  // puede invalidarla ni hacerla chocar con otra fila.
  assert.equal(fingerprintKey(base), fingerprintKey({ ...base }));
  assert.equal(fingerprintKey(base), fingerprintKey({ ...base, kind: "installment" }));
});

test("editar monto, fecha, descripcion, cuenta o plastico si cambia la clave", () => {
  for (const cambio of [
    { amount: 8810001 },
    { occurredOn: "2026-06-27" },
    { description: "OTRO COMERCIO" },
    { accountId: "cuenta-2" },
    { cardLast4: "5678" },
    { currency: "USD" as const },
  ]) {
    assert.notEqual(
      fingerprintKey(base),
      fingerprintKey({ ...base, ...cambio }),
      `${JSON.stringify(cambio)} tendria que cambiar la clave`,
    );
  }
});

test("la clave ignora mayusculas y signos de la descripcion", () => {
  // Se normaliza igual que al importar, asi que corregir "mc donalds" a
  // "McDonald's" no invalida la huella.
  assert.equal(
    fingerprintKey({ ...base, description: "comercio ejemplo" }),
    fingerprintKey({ ...base, description: "COMERCIO*EJEMPLO" }),
  );
});
