-- Seed de arranque: plan de categorias.
--
-- Idempotente: se puede correr de nuevo sin duplicar nada, apoyado en el
-- unique (user_id, name) de categories.
--
-- La app registra dos tipos de gasto, Gasto y Cuota, y los dos comparten estas
-- categorias. Por eso todas son de familia 'expense': no hay categorias de
-- ingreso ni de transferencia, no habria con que usarlas.
--
-- Las cuentas no se seedean: se crean desde la pantalla de Cuentas, que ya
-- permite el alta.
insert into public.categories (user_id, name, kind)
select u.id, v.name, v.kind
  from (select id from auth.users order by created_at limit 1) u
 cross join (values
   ('Comida',                'expense'),
   ('Supermercado',          'expense'),
   ('Combustible',           'expense'),
   ('Transporte',            'expense'),
   ('Farmacia',              'expense'),
   ('Salud',                 'expense'),
   ('Ropa',                  'expense'),
   ('Hogar',                 'expense'),
   ('Facultad',              'expense'),
   ('Suscripciones',         'expense'),
   ('Servicios',             'expense'),
   ('Internet y telefonia',  'expense'),
   ('Seguros',               'expense'),
   ('Regalo',                'expense'),
   ('Entretenimiento',       'expense'),
   ('Viajes',                'expense'),
   ('Mascotas',              'expense'),
   ('Otros gastos',          'expense'),
   -- No son compras, pero la plata se fue igual: son gastos como cualquier otro.
   ('Impuestos',             'expense'),
   ('Financiacion',          'expense')
 ) as v(name, kind)
on conflict (user_id, name) do nothing;
