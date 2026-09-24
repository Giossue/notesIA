-- Reversión manual local: se niega si existen avisos programados o preferencias modificadas.
begin;
do $$ begin
  if exists (select 1 from dominio.notificaciones where tipo <> 'plan_applied')
     or exists (select 1 from dominio.preferencias_avisos
                where version <> 1 or anticipacion_plazo_minutos <> 1440
                  or anticipacion_bloque_minutos <> 15 or enfriamiento_riesgo_minutos <> 1440) then
    raise exception 'Scheduled notifications or custom preferences exist';
  end if;
end $$;
drop index dominio.notificaciones_riesgo_unicas;
drop index dominio.notificaciones_bloque_unicas;
drop index dominio.notificaciones_plazo_unicas;
alter table dominio.notificaciones drop constraint notificaciones_forma_ck;
alter table dominio.notificaciones drop constraint notificaciones_bloque_fk;
alter table dominio.notificaciones drop constraint notificaciones_actividad_fk;
alter table dominio.notificaciones drop constraint notificaciones_tipo_check;
alter table dominio.notificaciones add constraint notificaciones_tipo_check
  check (tipo = 'plan_applied');
alter table dominio.notificaciones
  alter column evento_salida_id set not null,
  alter column plan_id set not null,
  drop column actividad_id,
  drop column bloque_id,
  drop column referencia_en;
drop trigger usuarios_preferencias_avisos_creadas on autenticacion.usuarios;
drop function dominio.crear_preferencias_avisos();
drop table dominio.preferencias_avisos;
delete from public.migraciones where version = '0025_avisos_programados.sql';
commit;
