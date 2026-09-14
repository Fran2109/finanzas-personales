import { PasswordForm } from "@/components/PasswordForm";
import { CategoryForm } from "@/components/CategoryForm";
import { deleteCategory } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data";

const CATEGORY_KIND_LABELS: Record<string, string> = {
  expense: "Gasto",
  tax_fee: "Impuesto o comision",
  financing: "Costo financiero",
  // Pueden existir de antes; la app ya no las ofrece.
  income: "Ingreso (sin uso)",
  transfer: "Transferencia (sin uso)",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data }, categories, rules] = await Promise.all([
    supabase.auth.getUser(),
    getCategories(),
    supabase
      .from("merchant_rules")
      .select("id, pattern, category_id, hit_count")
      .order("pattern"),
  ]);

  // min-w-0 en las dos columnas: un item de grid no baja de su ancho de
  // contenido, asi que sin esto un nombre largo ensancha la columna entera y
  // desborda la pagina en un telefono.
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-8">
        <section>
          <h1 className="mb-1 text-lg font-semibold">Ajustes</h1>
          <p className="text-sm text-muted">Sesion iniciada como {data.user?.email}.</p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Categorias ({categories.length})</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {CATEGORY_KIND_LABELS[c.kind] ?? c.kind}
                </span>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    aria-label="Borrar categoria"
                    className="text-muted hover:text-negative"
                  >
                    &times;
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-semibold">
            Reglas aprendidas ({(rules.data ?? []).length})
          </h2>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Cada vez que categorizás un comercio desconocido al revisar un
            resumen, se guarda una regla. El próximo resumen lo mapea solo.
          </p>
          {(rules.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">
              Todavía ninguna. Se escriben solas al importar.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {(rules.data ?? []).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <code className="min-w-0 flex-1 truncate text-xs">{r.pattern}</code>
                  <span className="shrink-0 text-xs text-muted">
                    {categories.find((c) => c.id === r.category_id)?.name ?? "?"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Contrasena</h2>
          <PasswordForm />
        </section>
      </div>

      <aside className="min-w-0">
        <h2 className="mb-3 text-sm font-semibold">Nueva categoria</h2>
        <CategoryForm />
      </aside>
    </div>
  );
}
