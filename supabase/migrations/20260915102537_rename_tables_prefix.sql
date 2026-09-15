-- Prefijo `finanzas_` en todas las tablas.
--
-- El proyecto Supabase pasa a llamarse «proyectos» y a estar COMPARTIDO con
-- job-hunter: el plan free permite solo 2 proyectos activos, asi que cada app
-- es un prefijo dentro del mismo Postgres y no un proyecto aparte. Sin prefijo,
-- nombres genericos como `transactions`, `categories` o `imports` quedan sin
-- dueno evidente y la tercera app que llegue los pisa.
--
-- El prefijo va en minusculas a proposito: Postgres baja a minusculas todo
-- identificador sin comillas, asi que `Finanzas_transactions` obligaria a
-- escribir comillas dobles en cada consulta para siempre.
--
-- `alter table ... rename` preserva datos, indices, constraints, foreign keys y
-- politicas de RLS: no se recrea nada ni se mueve una fila. La vista tampoco se
-- rompe, porque Postgres la guarda resuelta contra OIDs y no contra nombres.
--
-- OJO: esto es un cambio que rompe el codigo deployado hasta que salga el que
-- usa los nombres nuevos. Aplicar y deployar en la misma ventana.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
alter table public.accounts          rename to finanzas_accounts;
alter table public.categories        rename to finanzas_categories;
alter table public.fx_rates          rename to finanzas_fx_rates;
alter table public.installment_plans rename to finanzas_installment_plans;
alter table public.imports           rename to finanzas_imports;
alter table public.transactions      rename to finanzas_transactions;
alter table public.import_rows       rename to finanzas_import_rows;
alter table public.merchant_rules    rename to finanzas_merchant_rules;
alter table public.budgets           rename to finanzas_budgets;

alter view public.v_transactions_ars rename to finanzas_v_transactions_ars;

-- ---------------------------------------------------------------------------
-- Constraints con indice detras (primary key y unique).
--
-- Renombrarlos no es cosmetico: el nombre de un indice es unico POR SCHEMA, no
-- por tabla. En un proyecto compartido, un `transactions_pkey` sin dueno es
-- justo la colision que este prefijo viene a evitar.
-- ---------------------------------------------------------------------------
alter table public.finanzas_accounts          rename constraint accounts_pkey                          to finanzas_accounts_pkey;
alter table public.finanzas_accounts          rename constraint accounts_user_id_name_key              to finanzas_accounts_user_id_name_key;
alter table public.finanzas_categories        rename constraint categories_pkey                        to finanzas_categories_pkey;
alter table public.finanzas_categories        rename constraint categories_user_id_name_key            to finanzas_categories_user_id_name_key;
alter table public.finanzas_fx_rates          rename constraint fx_rates_pkey                          to finanzas_fx_rates_pkey;
alter table public.finanzas_installment_plans rename constraint installment_plans_pkey                 to finanzas_installment_plans_pkey;
alter table public.finanzas_imports           rename constraint imports_pkey                           to finanzas_imports_pkey;
alter table public.finanzas_transactions      rename constraint transactions_pkey                      to finanzas_transactions_pkey;
alter table public.finanzas_import_rows       rename constraint import_rows_pkey                       to finanzas_import_rows_pkey;
alter table public.finanzas_merchant_rules    rename constraint merchant_rules_pkey                    to finanzas_merchant_rules_pkey;
alter table public.finanzas_merchant_rules    rename constraint merchant_rules_user_id_pattern_key     to finanzas_merchant_rules_user_id_pattern_key;
alter table public.finanzas_budgets           rename constraint budgets_pkey                           to finanzas_budgets_pkey;
alter table public.finanzas_budgets           rename constraint budgets_user_id_category_id_period_key to finanzas_budgets_user_id_category_id_period_key;

-- ---------------------------------------------------------------------------
-- Indices sueltos (los que no respaldan un constraint).
-- ---------------------------------------------------------------------------
alter index public.import_rows_import_idx            rename to finanzas_import_rows_import_idx;
alter index public.transactions_account_idx          rename to finanzas_transactions_account_idx;
alter index public.transactions_category_idx         rename to finanzas_transactions_category_idx;
alter index public.transactions_cuotas_idx           rename to finanzas_transactions_cuotas_idx;
alter index public.transactions_fingerprint_uq       rename to finanzas_transactions_fingerprint_uq;
alter index public.transactions_occurred_idx         rename to finanzas_transactions_occurred_idx;
alter index public.transactions_plan_idx             rename to finanzas_transactions_plan_idx;
alter index public.transactions_projected_idx        rename to finanzas_transactions_projected_idx;
alter index public.transactions_statement_period_idx rename to finanzas_transactions_statement_period_idx;
