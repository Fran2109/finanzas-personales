# Finanzas personales

App web de control de finanzas personales de un solo usuario. Next.js 16 +
Supabase. El contexto de dominio y las decisiones de modelo están en
[`CLAUDE.md`](./CLAUDE.md); esto es solo cómo correrla.

## Arrancar

```bash
npm install
cp .env.example .env.local   # completar la key publishable
npm run dev
```

`.env.local` necesita:

```
NEXT_PUBLIC_SUPABASE_URL=https://tqdjpnxidmypsrlnvmdv.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Es la publishable (`sb_publishable_...`), no la anon legacy. Nunca se commitea.

## Comandos

| | |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` | build de producción (incluye chequeo de tipos) |
| `npm test` | tests unitarios (`node --test`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npx eslint .` | lint |

## Base de datos

El esquema vive en `supabase/migrations/`. El nombre de cada archivo tiene que
coincidir con la versión registrada en el remoto, o `supabase db push` intenta
reaplicarla y falla. `supabase/seed.sql` es idempotente: carga cuentas y el plan
de categorías sin duplicar si se corre de nuevo.

## Cómo está armado

```
src/lib/money.ts      plata en centavos: parseo, formato, ida y vuelta con la base
src/lib/domain.ts     kinds, signos, períodos, normalización de comercios
src/lib/data.ts       consultas del servidor y agregación del mes
src/app/actions.ts    server actions (login, alta, cuentas)
src/proxy.ts          refresh de sesión y redirect (en Next 16 es proxy, no middleware)
```

La autorización real es RLS en Postgres, no el proxy. Cada tabla filtra por
`user_id = auth.uid()` y el chequeo del proxy es solo para no mostrar pantallas
vacías a quien no está logueado.
