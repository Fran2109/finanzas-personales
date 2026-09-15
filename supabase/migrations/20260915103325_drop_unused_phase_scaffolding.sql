-- Borrar el andamiaje de las fases 2 y 4 que nunca se uso.
--
-- Cuatro relaciones vacias y sin una sola referencia en el codigo:
-- la vista multi-moneda, fx_rates, installment_plans y budgets. Se van
-- porque el proyecto ahora esta compartido con job-hunter y una tabla sin
-- uso en un schema compartido es ruido que el proximo que lo lea tiene que
-- descartar. Cuando la fase 2 modele cuotas y cotizaciones va a crear lo
-- que necesite, con la forma que necesite.
--
-- NO se edita `20260914112501_init.sql`, que ya esta aplicada: reescribir
-- historia aplicada la deja sin coincidir con lo que realmente corrio. Un
-- entorno limpio las crea con el init y las borra con esta, y termina en el
-- mismo estado.
--
-- El orden importa: la vista lee `plan_id` y `fx_rates`, asi que va primero;
-- despues la columna, que se lleva con ella la FK a installment_plans y el
-- indice parcial `finanzas_transactions_plan_idx`.
--
-- `plan_id` esta en NULL en las 151 filas, verificado antes de borrar: no se
-- pierde ningun dato. `cuota_number` y `cuota_total` (32 filas cada una) NO
-- se tocan — esos son los datos de cuotas que el analisis usa de verdad, que
-- deduce los planes de las propias filas y nunca leyo installment_plans.

drop view public.finanzas_v_transactions_ars;

alter table public.finanzas_transactions drop column plan_id;

drop table public.finanzas_installment_plans;
drop table public.finanzas_fx_rates;
drop table public.finanzas_budgets;
