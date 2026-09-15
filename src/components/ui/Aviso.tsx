/**
 * El recuadro que dice algo sobre lo que acaba de pasar, o sobre los datos.
 *
 * Es el unico de las primitivas que se gano ser componente: estaba copiado en
 * **19 lugares** de 13 archivos, y el mapeo de tono a clases es logica, no un
 * string. Los otros son cadenas de utilidades y viven en `estilos.ts`, porque
 * un componente ahi solo agregaria un `<div>` al arbol.
 *
 * Los textos que van adentro son parte del diseno, no decoracion: un error
 * explica que paso y como se arregla, y no pide disculpas.
 */

/** Que clase de cosa esta diciendo. */
export type Tono = "negativo" | "positivo" | "acento";

const TONOS: Record<Tono, string> = {
  negativo: "border-negative/40 bg-negative/10 text-negative",
  positivo: "border-positive/40 bg-positive/10 text-positive",
  // El acento no tine el texto: se usa para contar algo sobre los datos, no
  // para confirmar una accion, y ahi el cuerpo se lee mejor en gris.
  acento: "border-accent/40 bg-accent/10 text-muted",
};

/** Sin el color del tono en el texto, solo en el borde y el fondo. */
const SOBRIO: Record<Tono, string> = {
  negativo: "border-negative/40 bg-negative/10",
  positivo: "border-positive/40 bg-positive/10",
  acento: "border-accent/40 bg-accent/10",
};

export function Aviso({
  tono,
  children,
  /**
   * Para el aviso que cuenta algo largo y lleva su propio enfasis adentro:
   * pintarle todo el cuerpo del color del tono compite con ese enfasis.
   */
  sobrio = false,
  /** Adentro de una fila, donde el recuadro de pagina entera queda grande. */
  compacto = false,
  className = "",
}: {
  tono: Tono;
  children: React.ReactNode;
  sobrio?: boolean;
  compacto?: boolean;
  className?: string;
}) {
  const tamano = compacto ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm";
  const color = sobrio ? SOBRIO[tono] : TONOS[tono];
  return (
    <p className={`rounded-control border ${color} ${tamano} ${className}`.trim()}>
      {children}
    </p>
  );
}
