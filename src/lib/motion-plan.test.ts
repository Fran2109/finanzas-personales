import { test } from "node:test";
import assert from "node:assert/strict";

import { duracionTotal, plan, valorEn, WATCHDOG_MS } from "./motion-plan.ts";

test("la secuencia termina antes de que el watchdog la interrumpa", () => {
  // Es el unico bug que un test unitario puede atrapar aca, y ata dos numeros
  // que viven en archivos distintos: si alguien alarga la coreografia mas alla
  // del watchdog, el escondite se vence a mitad de animacion y todo aparece de
  // golpe. Solo se reproduce en un dispositivo lento, que es donde nadie mira.
  assert.ok(
    duracionTotal() < WATCHDOG_MS,
    `la secuencia dura ${duracionTotal()}ms y el watchdog vence a los ${WATCHDOG_MS}ms`,
  );
});

test("la duracion no crece con la cantidad de elementos", () => {
  // Lo garantiza `spread` (un total repartido) en vez de un incremento por
  // elemento. Si algun paso volviera al incremento, un mes con 40 movimientos
  // se pasaria del watchdog y este test no se enteraria —mide el plan, no el
  // DOM—, asi que lo que se afirma es la propiedad que lo hace imposible.
  for (const paso of plan()) {
    assert.ok(
      Number.isFinite(paso.spread),
      `${paso.target} tiene un spread que no es un total finito`,
    );
  }
});

test("ningun paso arranca antes de cero ni despues del final", () => {
  const fin = duracionTotal();
  for (const paso of plan()) {
    assert.ok(paso.at >= 0, `${paso.target} arranca en ${paso.at}`);
    assert.ok(paso.dur > 0, `${paso.target} dura ${paso.dur}`);
    assert.ok(paso.at < fin, `${paso.target} arranca despues del final`);
  }
});

test("el contador arranca en cero y termina exactamente en el valor", () => {
  // Que aterrice en el numero y no en un float que redondea mal es la unica
  // parte del contador que importa: es plata.
  assert.equal(valorEn(0, 1289539), 0);
  assert.equal(valorEn(1, 1289539), 1289539);
  assert.equal(valorEn(-0.5, 1289539), 0, "un progreso negativo no resta");
  assert.equal(valorEn(2, 1289539), 1289539, "no se pasa del valor");
});

test("el contador redondea al centavo en el medio", () => {
  // Un contador que muestra 12.895,3947 y despues corrige es peor que uno que
  // no anima.
  const v = valorEn(0.333, 1289539);
  assert.equal(v, Math.round(v), "no puede quedar un float en pantalla");
  assert.ok(v > 0 && v < 1289539);
});
