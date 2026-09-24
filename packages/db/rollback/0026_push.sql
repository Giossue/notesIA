-- Reversión manual local: se niega si hay dispositivos o envíos pendientes/registrados.
begin;
do $$ begin
  if exists (select 1 from dominio.dispositivos_push)
     or exists (select 1 from dominio.envios_push) then
    raise exception 'Push devices or deliveries exist';
  end if;
end $$;
drop table dominio.envios_push;
drop index dominio.dispositivos_push_antiguos_idx;
drop table dominio.dispositivos_push;
alter table dominio.notificaciones drop constraint notificaciones_usuario_id_uq;
delete from public.migraciones where version = '0026_push.sql';
commit;
