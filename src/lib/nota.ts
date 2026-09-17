/**
 * La nota de un movimiento: leerla de un formulario y escribirla entera.
 *
 * Vive aca y no en `actions.ts` por una razon del framework: un modulo con
 * `"use server"` solo puede exportar funciones async, asi que dos Server
 * Actions que necesitan la misma ayuda sincronica no se la pueden pasar. El
 * costo de no tenerla afuera era tenerla dos veces, y de hecho ya estaba: el
 * tope de 80 aparecia escrito a mano en el import.
 */

/**
 * El tope tambien esta en el `maxLength` del campo, pero eso es una cortesia
 * del navegador y toda Server Action es alcanzable por POST directo. Recorta en
 * vez de rechazar: es una nota, no un dato que haya que validar, y devolver un
 * error por dos caracteres de mas seria mas molesto que el problema.
 */
export const NOTA_MAX = 80;

export function leerNota(formData: FormData): string | null {
  const nota = String(formData.get("nota") ?? "")
    .trim()
    .slice(0, NOTA_MAX);
  return nota || null;
}

/**
 * Los dos campos de la nota de una transaccion, para que no se puedan escribir
 * por separado.
 *
 * `nota_at` es **cuando se escribio la nota**, y de eso depende el orden del
 * desplegable. Guardar la nota sin la fecha la dejaria ultima para siempre;
 * dejar la fecha de una nota borrada haria que una nota que ya no existe
 * siguiera ordenando. Los dos viven o mueren juntos, asi que se arman juntos y
 * no queda sitio de escritura donde se pueda olvidar uno.
 *
 * La hora sale del reloj del servidor y no de la base: para ordenar entre filas
 * que escribe el mismo servidor alcanza, y ahorra mandar un `now()` de SQL por
 * PostgREST. No es un dato que se muestre, es una clave de orden.
 *
 * Solo aplica a `finanzas_transactions`. `import_rows` guarda la nota y no la
 * fecha: ahi la nota todavia no se uso —el import puede no confirmarse nunca— y
 * la fecha la pone `commitImport` cuando la fila pasa a ser un movimiento.
 */
export function camposDeNota(nota: string | null): {
  nota: string | null;
  nota_at: string | null;
} {
  return { nota, nota_at: nota ? new Date().toISOString() : null };
}

/** Lo que `ordenarNotas` necesita de cada movimiento anotado. */
export type NotaUsada = { nota: string | null; nota_at: string | null };

/**
 * Las notas distintas, de la mas recientemente usada a la menos.
 *
 * Va aca y no adentro de `getNotas` para que se pueda testear: `data.ts` lleva
 * `server-only` y con el no entra en `node --test`. Esto es criterio —que nota
 * ofrecer primero— y el criterio es justo la parte que conviene fijar.
 *
 * El orden es **recencia, despues frecuencia, despues alfabetico**, y ninguno
 * de los tres esta de adorno:
 *
 * - Recencia primero porque anotar se hace de a tandas: la nota que acabas de
 *   escribir es la que mas chances tiene de ser la proxima.
 * - Frecuencia de desempate porque lo anotado antes de que existiera `nota_at`
 *   no tiene fecha y empata en cero; entre esas, cuantas veces se uso es la
 *   mejor senal que queda. Tambien empatan las filas de un mismo import.
 * - Alfabetico al final para que el orden sea estable: sin el, dos notas con la
 *   misma fecha y el mismo uso podrian salir en cualquier orden y la lista
 *   cambiaria sola entre dos cargas iguales.
 */
export function ordenarNotas(filas: NotaUsada[]): string[] {
  const usos = new Map<string, { veces: number; ultima: number }>();

  for (const fila of filas) {
    const nota = (fila.nota ?? "").trim();
    if (!nota) continue;
    const cuando = fila.nota_at ? Date.parse(fila.nota_at) : 0;
    const previo = usos.get(nota);
    usos.set(nota, {
      veces: (previo?.veces ?? 0) + 1,
      ultima: Math.max(previo?.ultima ?? 0, Number.isNaN(cuando) ? 0 : cuando),
    });
  }

  return [...usos]
    .sort(
      (a, b) =>
        b[1].ultima - a[1].ultima ||
        b[1].veces - a[1].veces ||
        a[0].localeCompare(b[0], "es"),
    )
    .map(([nota]) => nota);
}
