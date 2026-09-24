create table dominio.registros_tiempo (
  id uuid primary key,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  actividad_id uuid not null,
  origen text not null check (origen in ('timer', 'manual')),
  inicia_en timestamptz not null,
  termina_en timestamptz,
  duracion_segundos integer,
  ultima_mutacion_cierre uuid,
  version integer not null default 1 check (version > 0),
  creado_en timestamptz not null default now(),
  constraint registros_tiempo_actividad_fk foreign key (usuario_id, actividad_id)
    references dominio.actividades(usuario_id, id) on delete cascade,
  constraint registros_tiempo_duracion_ck check (
    (termina_en is null and duracion_segundos is null and origen = 'timer')
    or (termina_en > inicia_en and duracion_segundos > 0)
  )
);
create unique index registros_tiempo_sesion_abierta_uq on dominio.registros_tiempo (usuario_id)
  where termina_en is null;
create index registros_tiempo_usuario_fin_idx on dominio.registros_tiempo
  (usuario_id, termina_en desc, id desc) where termina_en is not null;
create index registros_tiempo_actividad_idx on dominio.registros_tiempo
  (usuario_id, actividad_id, termina_en) where termina_en is not null;
create trigger tiempo_revision_planificacion after insert or update on dominio.registros_tiempo
  for each row execute function dominio.avanzar_revision_planificacion();

grant select, insert, update, delete on dominio.registros_tiempo to notesia_app;
