-- Una nota corta y propia, para decir que fue el movimiento.
--
-- Va aparte de `description` y no encima, porque `description` es dos cosas a
-- la vez: en un movimiento cargado a mano es lo que se tipeo, pero en uno
-- importado es la transcripcion literal del resumen ("PLATAFORMA*SERVICIO-MENSUAL").
-- Pisarla perderia lo que decia el PDF.
--
-- Y sobre todo: `description` entra en la huella anti-duplicados. Anotar un
-- movimiento recalcularia su huella, y entonces reimportar ese resumen lo
-- traeria de nuevo como si fuera otro. `nota` queda fuera de la huella a
-- proposito: se puede anotar todo lo que haga falta sin que el resumen deje
-- de reconciliar.
alter table public.finanzas_transactions add column if not exists nota text;

-- La misma nota en staging, para poder anotar mientras se revisa el resumen.
-- Al confirmar el import viaja a la transaccion.
alter table public.finanzas_import_rows add column if not exists nota text;

-- Las sugerencias se piden por categoria y ordenadas por uso, asi que el
-- indice cubre justo esa consulta.
create index if not exists finanzas_transactions_nota_idx
  on public.finanzas_transactions (user_id, category_id, nota)
  where nota is not null;
