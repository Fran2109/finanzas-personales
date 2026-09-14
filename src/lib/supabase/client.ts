import { createBrowserClient } from "@supabase/ssr";

import { supabaseEnv } from "./env";

/** Cliente para componentes del browser. Solo usa la key publishable. */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
