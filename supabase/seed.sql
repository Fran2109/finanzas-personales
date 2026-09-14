-- Seed de arranque: cuentas y plan de categorias.
--
-- Idempotente: se puede correr de nuevo sin duplicar nada. Se apoya en los
-- unique (user_id, name) de accounts y categories.
--
-- App de un solo usuario: se resuelve el user_id del unico usuario en auth.

-- ---------------------------------------------------------------------------
-- Cuentas
-- ---------------------------------------------------------------------------
-- Galicia VISA agrupa los plasticos 1234 y 5678 en una sola cuenta: se pagan
-- juntos con un solo pago, asi que el pago del resumen tiene a que imputarse.
-- El numero de plastico va en transactions.card_last4.
insert into public.accounts (user_id, name, type, currency, is_liability)
select u.id, v.name, v.type, v.currency, v.is_liability
  from (select id from auth.users order by created_at limit 1) u
 cross join (values
   ('Galicia VISA', 'credit_card', 'ARS', true)
 ) as v(name, type, currency, is_liability)
on conflict (user_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------
-- `kind` separa la semantica economica. Los reportes de gasto filtran por
-- consumption y refund; tax_fee, financing y transfer se excluyen para no
-- distorsionar el analisis por categoria.
insert into public.categories (user_id, name, kind)
select u.id, v.name, v.kind
  from (select id from auth.users order by created_at limit 1) u
 cross join (values
   -- Consumo
   ('Supermercado',          'expense'),
   ('Restaurantes y delivery','expense'),
   ('Transporte',            'expense'),
   ('Combustible',           'expense'),
   ('Salud',                 'expense'),
   ('Farmacia',              'expense'),
   ('Servicios',             'expense'),
   ('Internet y telefonia',  'expense'),
   ('Suscripciones',         'expense'),
   ('Indumentaria',          'expense'),
   ('Hogar',                 'expense'),
   ('Educacion',             'expense'),
   ('Entretenimiento',       'expense'),
   ('Viajes',                'expense'),
   ('Mascotas',              'expense'),
   ('Regalos',               'expense'),
   ('Otros gastos',          'expense'),
   -- Ingresos
   ('Sueldo',                'income'),
   ('Freelance',             'income'),
   ('Intereses',             'income'),
   ('Otros ingresos',        'income'),
   -- No son consumo, pero son plata que se mueve
   ('Impuestos y percepciones', 'tax_fee'),
   ('Costos financieros',       'financing'),
   ('Transferencias',           'transfer')
 ) as v(name, kind)
on conflict (user_id, name) do nothing;
