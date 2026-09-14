import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente para Server Components, Server Actions y Route Handlers.
 *
 * Se crea uno por request: el cliente entrega los headers de no-cache junto con
 * la primera escritura de cookie, y reusarlo entre requests dejaria respuestas
 * con sesion sin esos headers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Desde un Server Component no se pueden escribir cookies. El
            // refresh de sesion lo hace el proxy, asi que se puede ignorar.
          }
        },
      },
    },
  );
}
