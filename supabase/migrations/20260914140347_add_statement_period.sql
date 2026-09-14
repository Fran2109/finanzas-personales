-- Periodo del resumen al que pertenece un movimiento de tarjeta.
--
-- Una compra del 26 de junio en 3 cuotas aparece en el resumen de agosto: la
-- plata sale en agosto, aunque la compra sea de junio. La vista del mes agrupa
-- por este campo cuando esta, y por occurred_on cuando no.
--
-- occurred_on NO se pisa a proposito: la fecha real de la compra es un dato que
-- no se puede recuperar despues, y sirve para saber cuando se decidio el gasto.
alter table public.transactions
  add column statement_period text
  check (statement_period ~ '^\d{4}-\d{2}$');

comment on column public.transactions.statement_period is
  'Periodo YYYY-MM del resumen de tarjeta que trajo el movimiento. Null en los movimientos cargados a mano.';

-- La vista del mes filtra por este campo, asi que necesita indice.
create index if not exists transactions_statement_period_idx
  on public.transactions (user_id, statement_period)
  where statement_period is not null;
