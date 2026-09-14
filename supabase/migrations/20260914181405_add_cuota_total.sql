-- Cuantas cuotas tiene el plan, no solo cual es esta.
--
-- Quedo afuera al principio a proposito: la huella se calcula sobre el numero
-- de cuota y no sobre el total, para poder recomputarla desde la fila. Eso
-- sigue igual —cuota_total NO entra en la huella— pero sin el total no se puede
-- responder cuanto falta, que es lo unico que convierte una cuota en un
-- compromiso futuro y no en un gasto pasado.
alter table public.transactions
  add column if not exists cuota_total smallint;

-- El dato ya estaba en el staging de cada import, que es transcripcion fiel.
update public.transactions t
   set cuota_total = r.cuota_total
  from public.import_rows r
 where t.import_id   = r.import_id
   and t.cuota_number = r.cuota_current
   and t.occurred_on  = r.occurred_on
   and t.description  = r.raw_description
   and t.cuota_total is null
   and r.cuota_total is not null;

-- Proyectar compromisos es buscar las cuotas que todavia no terminaron.
create index if not exists transactions_cuotas_idx
  on public.transactions (user_id, account_id, cuota_total)
  where cuota_total is not null;
