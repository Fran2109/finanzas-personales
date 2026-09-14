-- Esquema inicial de finanzas personales.
--
-- Esta migracion refleja el estado ya aplicado en el remoto bajo la version
-- 20260914112501. El nombre del archivo tiene que seguir coincidiendo con esa
-- version o `supabase db push` intenta reaplicarla y falla.

-- ---------------------------------------------------------------------------
-- Cuentas: la tarjeta se modela a nivel resumen, no por plastico.
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  type         text not null check (type in ('bank', 'cash', 'credit_card', 'investment')),
  currency     text not null default 'ARS' check (currency in ('ARS', 'USD')),
  is_liability boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- Categorias. `kind` acompana la semantica economica de la transaccion.
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  kind       text not null default 'expense'
             check (kind in ('expense', 'income', 'tax_fee', 'financing', 'transfer')),
  parent_id  uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- Cotizaciones: data de referencia compartida, no es de ningun usuario.
-- ---------------------------------------------------------------------------
create table if not exists public.fx_rates (
  rate_date   date not null,
  source      text not null check (source in ('oficial', 'mep', 'blue', 'tarjeta')),
  ars_per_usd numeric(18, 4) not null check (ars_per_usd > 0),
  created_at  timestamptz not null default now(),
  primary key (rate_date, source)
);

-- ---------------------------------------------------------------------------
-- Planes de cuotas: una compra en N cuotas genera N salidas de caja.
-- ---------------------------------------------------------------------------
create table if not exists public.installment_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete cascade,
  merchant     text not null,
  description  text,
  total_cuotas smallint not null check (total_cuotas > 0),
  cuota_amount numeric(18, 2) not null,
  currency     text not null default 'ARS' check (currency in ('ARS', 'USD')),
  first_due    date not null,
  status       text not null default 'active' check (status in ('active', 'closed', 'cancelled')),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Imports de resumenes. La reconciliacion es un gate: si el total computado no
-- iguala al declarado por moneda, el import queda 'rejected' y no se escribe
-- nada en transactions.
-- ---------------------------------------------------------------------------
create table if not exists public.imports (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id         uuid not null references public.accounts(id) on delete cascade,
  filename           text not null,
  storage_path       text,
  period_close       date,
  declared_total_ars numeric(18, 2),
  declared_total_usd numeric(18, 2),
  computed_total_ars numeric(18, 2),
  computed_total_usd numeric(18, 2),
  status             text not null default 'pending'
                     check (status in ('pending', 'reconciled', 'rejected', 'committed')),
  raw_extraction     jsonb,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Transacciones. Siempre monto y moneda originales: nunca pesificar al insertar.
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id          uuid not null references public.accounts(id) on delete restrict,
  category_id         uuid references public.categories(id) on delete set null,
  occurred_on         date not null,
  amount              numeric(18, 2) not null,
  currency            text not null default 'ARS' check (currency in ('ARS', 'USD')),
  kind                text not null default 'consumption'
                      check (kind in ('consumption', 'income', 'payment', 'refund',
                                      'tax_fee', 'financing', 'transfer')),
  description         text,
  merchant_normalized text,
  card_last4          text,
  plan_id             uuid references public.installment_plans(id) on delete set null,
  cuota_number        smallint,
  transfer_group_id   uuid,
  import_id           uuid references public.imports(id) on delete set null,
  is_projected        boolean not null default false,
  fingerprint         text,
  created_at          timestamptz not null default now()
);

create index if not exists transactions_account_idx  on public.transactions (account_id);
create index if not exists transactions_category_idx on public.transactions (category_id);
create index if not exists transactions_occurred_idx on public.transactions (user_id, occurred_on desc);
create index if not exists transactions_plan_idx     on public.transactions (plan_id) where plan_id is not null;

-- Red anti-duplicados: subir el mismo resumen dos veces lo rechaza la base.
create unique index if not exists transactions_fingerprint_uq
  on public.transactions (user_id, fingerprint) where fingerprint is not null;

-- ---------------------------------------------------------------------------
-- Staging del import. Nada llega a transactions sin pasar por aca.
-- ---------------------------------------------------------------------------
create table if not exists public.import_rows (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_id             uuid not null references public.imports(id) on delete cascade,
  line_no               integer,
  occurred_on           date,
  raw_description       text not null,
  amount                numeric(18, 2) not null,
  currency              text not null default 'ARS' check (currency in ('ARS', 'USD')),
  kind                  text,
  card_last4            text,
  cuota_current         smallint,
  cuota_total           smallint,
  suggested_category_id uuid references public.categories(id) on delete set null,
  needs_review          boolean not null default true,
  status                text not null default 'pending'
                        check (status in ('pending', 'accepted', 'discarded')),
  created_at            timestamptz not null default now()
);

create index if not exists import_rows_import_idx on public.import_rows (import_id);

-- ---------------------------------------------------------------------------
-- Reglas de comercio: primer nivel de categorizacion, deterministico.
-- ---------------------------------------------------------------------------
create table if not exists public.merchant_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pattern     text not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  hit_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, pattern)
);

-- ---------------------------------------------------------------------------
-- Presupuestos por categoria y periodo (YYYY-MM).
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  period      text not null check (period ~ '^\d{4}-\d{2}$'),
  cap_amount  numeric(18, 2) not null,
  currency    text not null default 'ARS' check (currency in ('ARS', 'USD')),
  unique (user_id, category_id, period)
);

-- ---------------------------------------------------------------------------
-- La conversion a ARS es un problema de lectura, contra la cotizacion vigente
-- a la fecha de la operacion.
-- ---------------------------------------------------------------------------
-- security_invoker no es opcional: sin eso la vista corre con los permisos de su
-- dueno y le pasa por arriba al RLS de transactions, devolviendo filas de
-- cualquier usuario a quien pueda leer la vista.
create or replace view public.v_transactions_ars
with (security_invoker = on) as
select
  t.id,
  t.user_id,
  t.account_id,
  t.category_id,
  t.occurred_on,
  t.amount,
  t.currency,
  t.kind,
  t.description,
  t.merchant_normalized,
  t.card_last4,
  t.plan_id,
  t.cuota_number,
  t.transfer_group_id,
  t.import_id,
  t.is_projected,
  t.fingerprint,
  t.created_at,
  case
    when t.currency = 'ARS' then t.amount
    else t.amount * (
      select f.ars_per_usd
        from public.fx_rates f
       where f.source = 'oficial'
         and f.rate_date <= t.occurred_on
       order by f.rate_date desc
       limit 1
    )
  end as amount_ars
from public.transactions t;

-- ---------------------------------------------------------------------------
-- RLS activo en todas las tablas, siempre, aunque haya un solo usuario.
-- ---------------------------------------------------------------------------
alter table public.accounts          enable row level security;
alter table public.categories        enable row level security;
alter table public.fx_rates          enable row level security;
alter table public.installment_plans enable row level security;
alter table public.imports           enable row level security;
alter table public.transactions      enable row level security;
alter table public.import_rows       enable row level security;
alter table public.merchant_rules    enable row level security;
alter table public.budgets           enable row level security;

create policy own_rows on public.accounts          for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.categories        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.installment_plans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.imports           for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.transactions      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.import_rows       for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.merchant_rules    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.budgets           for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- fx_rates es data de referencia: lectura para authenticated, escritura solo
-- desde el cron con service_role (que bypassea RLS).
create policy read_rates on public.fx_rates for select to authenticated using (true);
