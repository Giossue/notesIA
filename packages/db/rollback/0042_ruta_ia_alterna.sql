-- Reversión manual local. Conserva configuración y auditoría mientras existan datos.
begin;
do $$
begin
  if exists (select 1 from dominio.transiciones_ia)
    or exists (select 1 from dominio.rutas_ia where proveedor_alterno_id is not null) then
    raise exception 'AI alternate rollback refused: configuration or transitions exist';
  end if;
end;
$$;
drop table dominio.transiciones_ia;
alter table dominio.rutas_ia
  drop constraint rutas_ia_alterna_completa_check,
  drop column proveedor_alterno_id,
  drop column modelo_alterno_id,
  drop column tiempo_limite_alterno_ms,
  drop column maximo_salida_alterno_tokens,
  drop column precio_entrada_alterno_usd_millon,
  drop column precio_salida_alterno_usd_millon;
delete from public.migraciones where version = '0042_ruta_ia_alterna.sql';
commit;
