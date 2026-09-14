import Link from "next/link";
import { signOut } from "@/app/actions";

const navItems = [
  { href: "/", label: "Mes" },
  { href: "/importar", label: "Importar" },
  { href: "/cuentas", label: "Cuentas" },
  { href: "/ajustes", label: "Ajustes" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          {/* El nombre vuelve al inicio limpio: sin mes, sin filtros. Es el
              escape de una vista filtrada, que es justo cuando uno lo busca. */}
          <Link href="/" className="text-sm font-semibold transition hover:text-accent">
            Finanzas
          </Link>
          <nav className="flex gap-4 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted transition hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto">
            <button
              type="submit"
              className="text-sm text-muted transition hover:text-foreground"
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
