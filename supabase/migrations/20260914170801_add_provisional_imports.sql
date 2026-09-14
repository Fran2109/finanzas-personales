-- Un import provisorio es una lista de consumos pegada del home banking, de un
-- resumen que todavia no cerro. Sirve para ver como viene el mes antes del
-- cierre, y lo reemplaza el PDF real cuando llega.
--
-- Los movimientos que deja nacen con is_projected = true, que es la columna que
-- ya existia para las cuotas todavia no confirmadas: son lo mismo, plata que
-- todavia no es un hecho consumado.
alter table public.imports
  add column if not exists provisional boolean not null default false;

-- Reemplazar lo provisorio por lo real es una busqueda por cuenta y periodo.
create index if not exists transactions_projected_idx
  on public.transactions (user_id, account_id, statement_period)
  where is_projected;
