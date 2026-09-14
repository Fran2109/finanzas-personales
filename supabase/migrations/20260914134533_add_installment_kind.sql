-- Nuevo kind 'installment' para las compras en cuotas.
--
-- Solo cambia el CHECK de transactions.kind. categories.kind NO se toca a
-- proposito: una cuota se categoriza con una categoria de gasto comun, asi el
-- tipo dice que es financiada y la categoria sigue diciendo que se compro. Si
-- tuviera su propia familia de categorias, una compra en cuotas dejaria de
-- decir en que se fue la plata.
alter table public.transactions drop constraint transactions_kind_check;

alter table public.transactions add constraint transactions_kind_check
  check (kind in ('consumption', 'income', 'payment', 'refund',
                  'tax_fee', 'financing', 'transfer', 'installment'));
