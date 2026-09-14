-- Seed de arranque: plan de categorias.
--
-- Idempotente: se puede correr de nuevo sin duplicar nada, apoyado en el
-- unique (user_id, name) de categories.
--
-- La app registra gastos, asi que no hay categorias de ingreso ni de
-- transferencia: no habria con que usarlas. Los tipos de movimiento que la app
-- ofrece son los de `EXPENSE_KINDS`, y cada uno solo ve su familia.
--
-- Las cuentas no se seedean: se crean desde la pantalla de Cuentas, que ya
-- permite el alta.
insert into public.categories (user_id, name, kind)
select u.id, v.name, v.kind
  from (select id from auth.users order by created_at limit 1) u
 cross join (values
   -- Compras (kind expense): las ve cualquier gasto, cuota o reintegro.
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
   -- No son consumo, pero la plata se fue igual. Cada uno con su familia, para
   -- que no compitan con las compras en el desglose por categoria.
   ('Impuestos',             'tax_fee'),
   ('Financiacion',          'financing')
 ) as v(name, kind)
on conflict (user_id, name) do nothing;
