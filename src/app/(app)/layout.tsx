import Link from "next/link";
import { signOut } from "@/app/actions";

const navItems = [
  { href: "/", label: "Mes" },
  { href: "/analisis", label: "An\u00e1lisis" },
  { href: "/importar", label: "Importar" },
  { href: "/cuentas", label: "Cuentas" },
  { href: "/ajustes", label: "Ajustes" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        {/* Los targets del header crecen con padding y **sin** el margen
            negativo que los compensa en el resto de la app: aca la barra
            envuelve, y un margen negativo se come el gap entre las filas
            envueltas hasta montar una sobre otra. Se compensa achicando el
            padding del contenedor: el header queda 4px mas alto y la
            navegacion entera pasa a ser tocable. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
          {/* El nombre vuelve al inicio limpio: sin mes, sin filtros. Es el
              escape de una vista filtrada, que es justo cuando uno lo busca. */}
          <Link href="/" className="py-1.5 text-sm font-semibold transition hover:text-accent">
            Finanzas
          </Link>
          {/* flex-wrap: cinco items mas la marca y "Salir" no entran en una linea
              de telefono, y sin envolver empujan el ancho de toda la pagina. */}
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-1.5 text-muted transition hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto">
            <button
              type="submit"
              className="py-1.5 text-sm text-muted transition hover:text-foreground"
            >
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
