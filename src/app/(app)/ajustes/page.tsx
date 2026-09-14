import { PasswordForm } from "@/components/PasswordForm";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h1 className="mb-1 text-lg font-semibold">Ajustes</h1>
        <p className="text-sm text-muted">Sesion iniciada como {user?.email}.</p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Contrasena</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
