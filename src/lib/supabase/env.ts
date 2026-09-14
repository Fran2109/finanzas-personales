/**
 * Lectura de la configuracion de Supabase, con un error que se entiende.
 *
 * Son `NEXT_PUBLIC_*`, asi que Next las incrusta en el build, no las lee en
 * runtime: si faltan al buildear, no alcanza con cargarlas despues, hay que
 * redeployar. Sin esto el sintoma es un 500 opaco desde el proxy y el error
 * real solo aparece en los logs.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta ${name}. En local va en .env.local; en Vercel, en Settings > ` +
        `Environment Variables, marcada para Production, Preview y Development. ` +
        `Es NEXT_PUBLIC_*: se incrusta en el build, asi que despues de cargarla ` +
        `hay que volver a deployar para que tome efecto.`,
    );
  }
  return value;
}

export function supabaseEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    key: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
