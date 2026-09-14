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
        <h1 className="text-lg font-semibold">Finanzas</h1>
        <p className="mt-1 mb-6 text-sm text-muted">
          Control de gastos e ingresos.
        </p>
        <LoginForm next={next?.startsWith("/") ? next : "/"} />
      </div>
    </main>
  );
}
