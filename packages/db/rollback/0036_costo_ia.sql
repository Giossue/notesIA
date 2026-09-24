-- Reversión manual local. Rechaza la pérdida de precios configurados o uso registrado.
begin;
do $$ begin
  if exists (select 1 from dominio.uso_ia) or exists (
    select 1 from dominio.rutas_ia
    where precio_entrada_usd_millon is not null or precio_salida_usd_millon is not null
  ) then
    raise exception 'AI pricing or usage exists; review data before rollback';
  end if;
end $$;
alter table dominio.uso_ia
  drop column costo_usd,
  drop column uso_reportado,
  drop column precio_salida_usd_millon,
  drop column precio_entrada_usd_millon;
alter table dominio.rutas_ia
  drop column precio_salida_usd_millon,
  drop column precio_entrada_usd_millon;
delete from public.migraciones where version = '0036_costo_ia.sql';
commit;
