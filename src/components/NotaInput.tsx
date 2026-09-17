import { campo, campoCompacto } from "@/components/ui/estilos";
// Solo el tipo: `data.ts` lleva `server-only`, y este componente termina
// adentro de formularios de cliente. Un `import` de valor lo rompe en el build.
import type { NotasPorCategoria } from "@/lib/data";

/**
 * La nota del movimiento: se tipea o se elige una ya usada.
 *
 * **Es un `<input list>` con un `<datalist>`, y eso es todo.** El navegador da
 * el desplegable, filtra mientras se tipea y deja escribir cualquier cosa que
 * no este en la lista — que son exactamente las dos cosas que hacen falta:
 * reutilizar lo viejo y crear lo nuevo sin un paso de mas. Un combobox propio
 * serian ~80 lineas de JS al cliente para llegar al mismo lugar, con el teclado
 * y el lector de pantalla peor resueltos.
 *
 * Las sugerencias son **las de la categoria elegida**, no todas: al cargar un
 * supermercado lo que sirve son las notas de supermercado. Por eso el
 * `categoryId` es una prop y no algo que el componente deduzca — quien lo usa
 * ya tiene ese estado.
 *
 * El `<datalist>` se rinde con las opciones de la categoria activa nada mas, y
 * al cambiar de categoria React reemplaza esas opciones. Sin sugerencias no se
 * rinde ninguno y el `list` no apunta a nada: un `<datalist>` vacio deja al
 * campo con una flechita que no abre nada, que es peor que no tenerla.
 */
export function NotaInput({
  notas,
  categoryId,
  defaultValue,
  compacto = false,
  id = "nota",
  name = "nota",
  className = "",
}: {
  notas: NotasPorCategoria;
  /** La categoria elegida ahora mismo. Decide que sugerencias se ofrecen. */
  categoryId: string;
  defaultValue?: string;
  /** Adentro de una fila, donde el campo de pagina entera queda grande. */
  compacto?: boolean;
  id?: string;
  name?: string;
  className?: string;
}) {
  // La cadena vacia es la clave de "sin categoria" que arma `getNotas`.
  const sugerencias = notas[categoryId || ""] ?? [];
  const listId = `${id}-opciones`;

  return (
    <>
      <input
        id={id}
        name={name}
        list={sugerencias.length > 0 ? listId : undefined}
        defaultValue={defaultValue}
        autoComplete="off"
        maxLength={80}
        placeholder={sugerencias[0] ? `${sugerencias[0]}...` : "En que se fue"}
        className={`${compacto ? campoCompacto : campo} ${className}`.trim()}
      />
      {sugerencias.length > 0 ? (
        <datalist id={listId}>
          {sugerencias.map((nota) => (
            <option key={nota} value={nota} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}
