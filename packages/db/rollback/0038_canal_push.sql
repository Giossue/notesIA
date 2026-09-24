-- Reversión manual local: no perder elecciones de canal existentes.
begin;
do $$ begin
  if exists (select 1 from dominio.preferencias_usuario where not push_habilitado) then
    raise exception 'Push preference disabled for some accounts; review before rollback';
  end if;
end $$;
drop trigger preferencias_revision_planificacion_cambios on dominio.preferencias_usuario;
drop trigger preferencias_revision_planificacion on dominio.preferencias_usuario;
create trigger preferencias_revision_planificacion
  after insert or update on dominio.preferencias_usuario
  for each row execute function dominio.avanzar_revision_planificacion();
alter table dominio.preferencias_usuario drop column push_habilitado;
delete from public.migraciones where version = '0038_canal_push.sql';
commit;
