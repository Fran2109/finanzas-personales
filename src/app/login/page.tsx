import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* La unica pantalla que no tiene datos que mostrar, asi que es donde
            la identidad puede aparecer sola. La display se usa en dos lugares
            y en ninguno mas: aca, y en la cifra que es el argumento de una
            pantalla. Los dos son "esto es la cosa misma". */}
        <h1 className="font-display text-xl font-semibold tracking-tight">Finanzas</h1>
        <p className="mt-1 mb-8 text-sm text-muted">En qué se va la plata.</p>
        <LoginForm next={next?.startsWith("/") ? next : "/"} />
      </div>
    </main>
  );
}
