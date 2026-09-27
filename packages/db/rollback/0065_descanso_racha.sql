-- Reversión manual: desplegar primero el código anterior a 0065.
begin;
delete from dominio.dias_racha where es_descanso;
alter table dominio.dias_racha drop constraint dias_racha_descanso_sin_actividad_ck;
alter table dominio.dias_racha drop column es_descanso;
create or replace function dominio.registrar_dia_racha() returns trigger language plpgsql as $$
begin
  if new.estado = 'completed' and new.completado_en is not null
     and (tg_op = 'INSERT' or old.completado_en is distinct from new.completado_en) then
    insert into dominio.dias_racha (usuario_id, fecha, actividad_id)
    select new.usuario_id, (new.completado_en at time zone profile.zona_horaria)::date, new.id
    from dominio.perfiles_usuario profile where profile.usuario_id = new.usuario_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;
delete from public.migraciones where version = '0065_descanso_racha.sql';
commit;
