-- El insert de commitImport nunca escribio cuota_total, asi que todo import
-- confirmado despues de 20260914181405 dejo sus cuotas sin total. Sin total la
-- cuota queda huerfana: se sabe que es la 6, no de cuantas, el analisis no
-- puede deducir el plan y proyecta esa cuota como si todavia no hubiera
-- pasado, dentro de un mes que ya esta cargado.
--
-- El insert ya escribe la columna. Esto repara lo que quedo en el camino, con
-- el dato que siempre estuvo en el staging, que es transcripcion fiel.
update public.finanzas_transactions t
   set cuota_total = r.cuota_total
  from public.finanzas_import_rows r
 where t.import_id    = r.import_id
   and t.cuota_number = r.cuota_current
   and t.occurred_on  = r.occurred_on
   and t.description  = r.raw_description
   and t.cuota_total is null
   and r.cuota_total is not null;
