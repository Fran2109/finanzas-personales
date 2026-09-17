-- Cuando se escribio la nota, para poder ofrecer las ultimas usadas primero.
--
-- El desplegable ordenaba por frecuencia, y eso es el orden equivocado para lo
-- que uno hace de verdad: anotar de a tandas. Al anotar diez movimientos
-- seguidos, la nota que acabas de escribir es la que mas chances tiene de ser
-- la proxima, y con frecuencia quedaba sepultada abajo de una vieja que se uso
-- muchas veces hace meses.
--
-- **Hace falta una columna porque no habia con que contestarlo.** `created_at`
-- es cuando entro la fila —en un import, todas iguales— y `occurred_on` es
-- cuando se hizo la compra: una nota escrita hoy sobre un movimiento de julio
-- ordenaria por julio. Ninguno de los dos dice cuando se escribio la nota.
alter table public.finanzas_transactions add column if not exists nota_at timestamptz;

-- Punto de partida para lo ya anotado. `created_at` no es cuando se escribio la
-- nota y no se pretende que lo sea: es el unico dato que existe y da un orden
-- estable en vez de uno al azar. Dentro de un mismo import empatan todas, y ahi
-- decide el desempate de `getNotas` (frecuencia, despues alfabetico).
update public.finanzas_transactions
   set nota_at = created_at
 where nota is not null
   and nota_at is null;

-- La consulta es "las notas de esta categoria, las mas recientes primero".
drop index if exists finanzas_transactions_nota_idx;
create index if not exists finanzas_transactions_nota_idx
  on public.finanzas_transactions (user_id, category_id, nota_at desc)
  where nota is not null;
