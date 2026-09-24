create table dominio.preferencias_avisos (
  usuario_id uuid primary key references autenticacion.usuarios(id) on delete cascade,
  anticipacion_plazo_minutos integer not null default 1440
    check (anticipacion_plazo_minutos between 15 and 10080),
  anticipacion_bloque_minutos integer not null default 15
    check (anticipacion_bloque_minutos between 5 and 120),
  enfriamiento_riesgo_minutos integer not null default 1440
    check (enfriamiento_riesgo_minutos between 60 and 10080),
  version integer not null default 1 check (version > 0),
  actualizado_en timestamptz not null default now()
);
insert into dominio.preferencias_avisos (usuario_id)
  select id from autenticacion.usuarios on conflict do nothing;
create function dominio.crear_preferencias_avisos() returns trigger language plpgsql as $$
begin
  insert into dominio.preferencias_avisos (usuario_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger usuarios_preferencias_avisos_creadas after insert on autenticacion.usuarios
  for each row execute function dominio.crear_preferencias_avisos();

alter table dominio.notificaciones
  alter column evento_salida_id drop not null,
  alter column plan_id drop not null,
  add column actividad_id uuid,
  add column bloque_id uuid,
  add column referencia_en timestamptz;
alter table dominio.notificaciones drop constraint notificaciones_tipo_check;
alter table dominio.notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('plan_applied', 'deadline_reminder', 'block_reminder', 'risk_alert'));
alter table dominio.notificaciones add constraint notificaciones_actividad_fk
  foreign key (usuario_id, actividad_id) references dominio.actividades(usuario_id, id)
  on delete cascade;
alter table dominio.notificaciones add constraint notificaciones_bloque_fk
  foreign key (usuario_id, bloque_id) references dominio.bloques_plan(usuario_id, id)
  on delete cascade;
alter table dominio.notificaciones add constraint notificaciones_forma_ck check (
  (tipo = 'plan_applied' and evento_salida_id is not null and plan_id is not null
    and actividad_id is null and bloque_id is null and referencia_en is null)
  or (tipo = 'deadline_reminder' and evento_salida_id is null and plan_id is null
    and actividad_id is not null and bloque_id is null and referencia_en is not null)
  or (tipo = 'block_reminder' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is not null and referencia_en is not null)
  or (tipo = 'risk_alert' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is null and referencia_en is null)
);
create unique index notificaciones_plazo_unicas on dominio.notificaciones
  (usuario_id, actividad_id, referencia_en) where tipo = 'deadline_reminder';
create unique index notificaciones_bloque_unicas on dominio.notificaciones
  (usuario_id, bloque_id, referencia_en) where tipo = 'block_reminder';
create unique index notificaciones_riesgo_unicas on dominio.notificaciones
  (usuario_id, plan_id, actividad_id) where tipo = 'risk_alert';

grant select, insert, update on dominio.preferencias_avisos to notesia_app;
revoke delete on dominio.preferencias_avisos from notesia_app;
