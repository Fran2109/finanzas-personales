import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseEnv } from "./env";

/**
 * Cliente para Server Components, Server Actions y Route Handlers.
 *
 * Se crea uno por request: el cliente entrega los headers de no-cache junto con
 * la primera escritura de cookie, y reusarlo entre requests dejaria respuestas
 * con sesion sin esos headers.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
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
          // Desde un Server Component no se pueden escribir cookies. El refresh
          // de sesion lo hace el proxy, asi que se puede ignorar.
        }
      },
    },
  });
}
