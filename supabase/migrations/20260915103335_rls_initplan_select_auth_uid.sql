-- Envolver auth.uid() en un subselect para que se evalue UNA vez por consulta
-- y no una vez por fila (lint auth_rls_initplan de Supabase).
--
-- Sin el subselect, el planner trata auth.uid() como volatil y lo llama por
-- cada fila candidata. Con el, queda como InitPlan: se resuelve una sola vez
-- y el resultado se compara contra todas. La semantica es identica — esto no
-- afloja el RLS ni un poco, solo deja de recalcular lo mismo 151 veces.

alter policy own_rows on public.finanzas_accounts
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy own_rows on public.finanzas_categories
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy own_rows on public.finanzas_imports
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy own_rows on public.finanzas_transactions
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy own_rows on public.finanzas_import_rows
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy own_rows on public.finanzas_merchant_rules
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
