-- Racha de estudio: un registro por día (en la zona del estudiante) en que
-- completó al menos una actividad. Se guarda al completar y no se borra si la
-- actividad se reabre o se elimina: el día ya quedó ganado.
create table dominio.dias_racha (
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  fecha date not null,
  -- Actividad con la que se ganó el día (sin FK: la actividad puede borrarse).
  actividad_id uuid,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, fecha)
);

create function dominio.registrar_dia_racha() returns trigger language plpgsql as $$
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
create trigger actividades_dia_racha after insert or update of estado, completado_en
  on dominio.actividades for each row execute function dominio.registrar_dia_racha();

-- Días ya ganados con las actividades completadas hasta hoy.
insert into dominio.dias_racha (usuario_id, fecha, actividad_id, creado_en)
select distinct on (a.usuario_id, (a.completado_en at time zone profile.zona_horaria)::date)
  a.usuario_id, (a.completado_en at time zone profile.zona_horaria)::date, a.id, a.completado_en
from dominio.actividades a
join dominio.perfiles_usuario profile on profile.usuario_id = a.usuario_id
where a.estado = 'completed' and a.completado_en is not null
order by a.usuario_id, (a.completado_en at time zone profile.zona_horaria)::date, a.completado_en
on conflict do nothing;

grant select, insert on dominio.dias_racha to notesia_app;

-- Aviso "tu racha está en peligro": uno por día; referencia_en es el inicio de ese día.
alter table dominio.notificaciones drop constraint notificaciones_tipo_check;
alter table dominio.notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('plan_applied', 'deadline_reminder', 'block_reminder', 'risk_alert',
    'streak_at_risk'));
alter table dominio.notificaciones drop constraint notificaciones_forma_ck;
alter table dominio.notificaciones add constraint notificaciones_forma_ck check (
  (tipo = 'plan_applied' and evento_salida_id is not null and plan_id is not null
    and actividad_id is null and bloque_id is null and referencia_en is null)
  or (tipo = 'deadline_reminder' and evento_salida_id is null and plan_id is null
    and actividad_id is not null and bloque_id is null and referencia_en is not null)
  or (tipo = 'block_reminder' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is not null and referencia_en is not null)
  or (tipo = 'risk_alert' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is null and referencia_en is null)
  or (tipo = 'streak_at_risk' and evento_salida_id is null and plan_id is null
    and actividad_id is null and bloque_id is null and referencia_en is not null)
);
create unique index notificaciones_racha_unicas on dominio.notificaciones
  (usuario_id, referencia_en) where tipo = 'streak_at_risk';
