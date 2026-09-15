"use client";

import { useEffect, useRef } from "react";

import { entrada } from "@/lib/motion";

/**
 * La entrada de una pantalla: un solo momento orquestado y nada mas.
 *
 * La skill de diseno es explicita en que un fade-and-slide en cada seccion mas
 * una transicion en cada hover es el default generico, el que se lee como
 * generado. Aca hay una secuencia al entrar, y despues movimiento solo como
 * respuesta a algo que hiciste.
 *
 * **Se monta en la pagina y no en el layout.** Un layout no se desmonta nunca,
 * asi que montarlo ahi obligaria a sincronizar a mano con `usePathname()` —la
 * fuente del peor bug de esta categoria— y ademas les cobraria el chunk de GSAP
 * a `/importar`, `/cuentas`, `/ajustes` y `/login`, que no animan nada.
 *
 * No usa `useGSAP` de `@gsap/react`: ese hook limpia revirtiendo un
 * `gsap.context`, y las tweens de aca viven adentro de un `matchMedia`, que el
 * contexto no colecta. O sea que su limpieza automatica no cubriria justo lo
 * que hay que limpiar; la de abajo si. Eran 1,4 KB por nada.
 */
export function Orquesta({
  /** Cual pantalla es, para no repetirle la entrada al que vuelve. */
  pantalla,
  children,
}: {
  pantalla: string;
  children: React.ReactNode;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scope.current) return;
    return entrada(scope.current, pantalla);
  }, [pantalla]);

  // `display: contents` para no meter una caja en el arbol. Un envoltorio de
  // mas es la forma mas probable de reintroducir los desbordes que costaron una
  // auditoria entera: un item de flex o de grid no baja de su ancho de
  // contenido, y este div seria hijo directo de `<main>`.
  return (
    <div ref={scope} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
