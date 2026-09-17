import { test } from "node:test";
import assert from "node:assert/strict";
import { camposDeNota, ordenarNotas, NOTA_MAX } from "./nota.ts";

/** Una fila anotada, con la fecha escrita como la manda PostgREST. */
const usada = (nota: string | null, cuando: string | null) => ({
  nota,
  nota_at: cuando,
});

test("la mas recientemente usada va primero, aunque se haya usado una sola vez", () => {
  const filas = [
    // Tres veces, pero la ultima hace meses.
    usada("nafta de la moto", "2026-07-01T10:00:00Z"),
    usada("nafta de la moto", "2026-07-02T10:00:00Z"),
    usada("nafta de la moto", "2026-07-03T10:00:00Z"),
    // Una sola vez, hoy. Es la que uno va a querer repetir.
    usada("nafta del auto", "2026-09-17T10:00:00Z"),
  ];
  assert.deepEqual(ordenarNotas(filas), ["nafta del auto", "nafta de la moto"]);
});

test("de una nota se toma su uso mas reciente, no el primero", () => {
  // Si se mirara el primer uso, "vieja" ganaria por haber empezado antes.
  const filas = [
    usada("vieja", "2026-06-01T10:00:00Z"),
    usada("nueva", "2026-07-01T10:00:00Z"),
    usada("vieja", "2026-09-01T10:00:00Z"),
  ];
  assert.deepEqual(ordenarNotas(filas), ["vieja", "nueva"]);
});

test("empatadas en fecha decide la frecuencia, y despues el alfabeto", () => {
  // Es el caso de un import: todas las filas se confirman en el mismo momento.
  const cuando = "2026-08-01T10:00:00Z";
  const filas = [
    usada("zeta", cuando),
    usada("alfa", cuando),
    usada("beta", cuando),
    usada("beta", cuando),
  ];
  assert.deepEqual(ordenarNotas(filas), ["beta", "alfa", "zeta"]);
});

test("una nota sin fecha va al fondo, no adelante", () => {
  // Lo anotado antes de que existiera `nota_at` no tiene fecha. Si `null` se
  // leyera como "ahora" —o si NaN se colara en la comparacion— lo mas viejo
  // saldria primero, que es exactamente al reves de lo que se pide.
  const filas = [
    usada("sin fecha", null),
    usada("sin fecha", null),
    usada("sin fecha", null),
    usada("con fecha", "2026-01-01T10:00:00Z"),
  ];
  assert.deepEqual(ordenarNotas(filas), ["con fecha", "sin fecha"]);
});

test("una fecha ilegible se trata como sin fecha y no envenena el orden", () => {
  // `Date.parse` devuelve NaN, y `NaN - x` tambien es NaN, que en JavaScript es
  // **falsy**: el `||` del comparador se lo come y la comparacion se cae al
  // criterio siguiente como si las fechas empataran. Por eso la nota rota lleva
  // mas usos que la buena — asi, sin la guarda contra NaN, ganaria por
  // frecuencia y este test lo dice. Con menos usos el bug pasaria inadvertido.
  const filas = [
    usada("rota", "no es una fecha"),
    usada("rota", "tampoco"),
    usada("rota", "ni ahi"),
    usada("buena", "2026-05-05T10:00:00Z"),
  ];
  assert.deepEqual(ordenarNotas(filas), ["buena", "rota"]);
});

test("lo que no es una nota no entra en la lista", () => {
  const filas = [usada(null, null), usada("   ", "2026-09-01T10:00:00Z"), usada("real", null)];
  assert.deepEqual(ordenarNotas(filas), ["real"]);
});

test("la nota y su fecha se escriben juntas o no se escriben", () => {
  const puesta = camposDeNota("algo");
  assert.equal(puesta.nota, "algo");
  assert.ok(puesta.nota_at && !Number.isNaN(Date.parse(puesta.nota_at)));

  // Borrar la nota tiene que borrar la fecha: si no, una nota que ya no existe
  // seguiria ordenando.
  assert.deepEqual(camposDeNota(null), { nota: null, nota_at: null });
});

test("el tope de la nota es el mismo que dice el campo", () => {
  assert.equal(NOTA_MAX, 80);
});
