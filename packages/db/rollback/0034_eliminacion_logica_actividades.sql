-- Reversión manual local: se niega si ya existe historial de eliminación.
begin;
do $$ begin
  if exists (select 1 from dominio.historial_actividades where tipo_evento = 'deleted') then
    raise exception 'Deleted activity history exists; resolve before rollback';
  end if;
end $$;
alter table dominio.historial_actividades
  drop constraint historial_actividades_tipo_evento_ck;
alter table dominio.historial_actividades
  add constraint historial_actividades_tipo_evento_ck
  check (tipo_evento in ('completed', 'reopened', 'progress_updated'));
delete from public.migraciones where version = '0034_eliminacion_logica_actividades.sql';
commit;
