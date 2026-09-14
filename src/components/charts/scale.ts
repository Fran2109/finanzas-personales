/**
 * Escalas y formas de los graficos.
 *
 * Los graficos se dibujan en SVG a mano y del lado del servidor. No hay
 * libreria: son cuatro formas simples, y una dependencia de graficos pesa mas
 * que todo esto junto y ademas obliga a mandar JavaScript al cliente para
 * dibujar numeros que ya estan calculados.
 */

/**
 * El paso de la grilla, redondeado a un numero que se pueda leer.
 *
 * Un eje que dice 833.333 no lo lee nadie. Se busca el paso "lindo" mas chico
 * que cubra el maximo en aproximadamente `target` marcas.
 */
export function niceStep(max: number, target = 3): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const crudo = max / target;
  const magnitud = Math.pow(10, Math.floor(Math.log10(crudo)));
  for (const m of [1, 2, 2.5, 5]) {
    if (crudo <= m * magnitud) return m * magnitud;
  }
  return 10 * magnitud;
}

/** Las marcas del eje, desde cero hasta cubrir el maximo. */
export function niceTicks(max: number, target = 3): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const step = niceStep(max, target);
  const ticks: number[] = [];
  // El tope siempre cubre el maximo, asi ninguna barra se sale de la grilla.
  for (let v = 0; v < max - 1e-9; v += step) ticks.push(v);
  ticks.push(ticks.length * step);
  return ticks;
}

/** El tope del eje: la ultima marca. */
export function axisMax(max: number, target = 3): number {
  const ticks = niceTicks(max, target);
  return ticks[ticks.length - 1] || 1;
}

/**
 * Una columna que crece desde la base, con la punta redondeada.
 *
 * Redondeada arriba y cuadrada abajo a proposito: el extremo redondeado marca
 * donde termina el dato, y la base cuadrada la ancla a la linea del cero. Una
 * barra redondeada de los dos lados flota y se lee mal contra el eje.
 */
export function columnPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 4,
): string {
  const base = y + height;
  const r = Math.max(0, Math.min(radius, width / 2, height));
  if (height <= 0) return "";
  return [
    `M${x},${base}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${base}`,
    "Z",
  ].join("");
}

/** Lo mismo acostado: crece hacia la derecha desde `x`. */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 4,
): string {
  const r = Math.max(0, Math.min(radius, height / 2, width));
  if (width <= 0) return "";
  return [
    `M${x},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height - r}`,
    `Q${x + width},${y + height} ${x + width - r},${y + height}`,
    `L${x},${y + height}`,
    "Z",
  ].join("");
}
