-- Un día sin actividades disponibles pausa la racha sin contar como día ganado.
-- Los días anteriores a esta migración no se clasifican retroactivamente.
alter table dominio.dias_racha
  add column es_descanso boolean not null default false;
alter table dominio.dias_racha
  add constraint dias_racha_descanso_sin_actividad_ck
  check (not es_descanso or actividad_id is null);

-- Una finalización tardía prevalece sobre un descanso registrado para la fecha.
create or replace function dominio.registrar_dia_racha() returns trigger language plpgsql as $$
begin
  if new.estado = 'completed' and new.completado_en is not null
     and (tg_op = 'INSERT' or old.completado_en is distinct from new.completado_en) then
    insert into dominio.dias_racha (usuario_id, fecha, actividad_id, es_descanso)
    select new.usuario_id, (new.completado_en at time zone profile.zona_horaria)::date,
      new.id, false
    from dominio.perfiles_usuario profile where profile.usuario_id = new.usuario_id
    on conflict (usuario_id, fecha) do update
      set actividad_id = excluded.actividad_id, es_descanso = false,
          creado_en = excluded.creado_en
      where dominio.dias_racha.es_descanso;
  end if;
  return new;
end;
$$;
