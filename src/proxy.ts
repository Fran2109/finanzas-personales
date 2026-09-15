import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { msUntilValid, TOPE_ESPERA_MS } from "@/lib/clock-skew";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Refresca la sesion en cada request y saca del paso a quien no esta logueado.
 *
 * En Next 16 esto se llama proxy, no middleware. Es un chequeo optimista: la
 * autorizacion de verdad la hace RLS en cada consulta, no este archivo.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url: supabaseUrl, key: supabaseKey } = supabaseEnv();

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Una respuesta que setea cookies de sesion no puede quedar cacheada en
        // un CDN: serviria el token de una persona a otra.
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // El refresh de sesion pasa por aca, asi que aca es donde puede nacer un
  // token que PostgREST todavia no acepta. Si el `iat` esta adelantado se
  // espera lo que el propio token dice que falta, en vez de dejar que la
  // pagina haga tres consultas a sa-east-1 para fallar tres veces igual.
  if (user) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const espera = session?.access_token ? msUntilValid(session.access_token) : 0;
    if (espera > 0) {
      // Queda en los logs: la proxima vez el desfasaje es un numero medido y no
      // una hipotesis. Si toca el tope, el problema es de relojes y hay que
      // mirarlo, no seguir subiendo la espera.
      console.warn(
        `[clock-skew] token emitido ${espera}ms en el futuro${
          espera >= TOPE_ESPERA_MS ? " (tope alcanzado)" : ""
        }`,
      );
      await new Promise((resolve) => setTimeout(resolve, espera));
    }
  }

  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Todo menos assets estaticos y archivos con extension.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
