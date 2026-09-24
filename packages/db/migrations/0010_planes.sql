create table dominio.revisiones_planificacion (
  usuario_id uuid primary key references autenticacion.usuarios(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0)
);

create function dominio.avanzar_revision_planificacion() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  insert into dominio.revisiones_planificacion (usuario_id, revision)
    values (new.usuario_id, 1)
    on conflict (usuario_id) do update
      set revision = dominio.revisiones_planificacion.revision + 1;
  return new;
end;
$$;

create trigger actividades_revision_planificacion after insert or update on dominio.actividades
  for each row execute function dominio.avanzar_revision_planificacion();
create trigger eventos_revision_planificacion after insert or update on dominio.eventos_calendario
  for each row execute function dominio.avanzar_revision_planificacion();
create trigger reglas_revision_planificacion after insert or update on dominio.reglas_disponibilidad
  for each row execute function dominio.avanzar_revision_planificacion();
create trigger excepciones_revision_planificacion after insert or update on dominio.excepciones_disponibilidad
  for each row execute function dominio.avanzar_revision_planificacion();
create trigger ventanas_revision_planificacion after insert or update on dominio.ventanas_excepcion
  for each row execute function dominio.avanzar_revision_planificacion();
create trigger perfiles_revision_planificacion after insert or update on dominio.perfiles_usuario
  for each row execute function dominio.avanzar_revision_planificacion();

create table dominio.planes (
  id uuid primary key,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  estado text not null check (estado in ('draft', 'active', 'superseded', 'rejected')),
  version integer not null default 1 check (version > 0),
  version_algoritmo text not null,
  revision_origen bigint not null check (revision_origen >= 0),
  plan_base_id uuid,
  fecha_desde date not null,
  fecha_hasta date not null,
  sesion_minima integer not null check (sesion_minima between 1 and 240),
  sesion_maxima integer not null check (sesion_maxima between sesion_minima and 480),
  maximo_diario integer not null check (maximo_diario between sesion_minima and 1440),
  creado_en timestamptz not null default now(),
  aplicado_en timestamptz,
  constraint planes_fechas_ck check (fecha_hasta > fecha_desde),
  constraint planes_usuario_id_uq unique (usuario_id, id),
  constraint planes_base_fk foreign key (usuario_id, plan_base_id)
    references dominio.planes(usuario_id, id)
);
create unique index planes_usuario_activo_uq on dominio.planes (usuario_id) where estado = 'active';
create index planes_usuario_creado_idx on dominio.planes (usuario_id, creado_en desc, id desc);

create table dominio.bloques_plan (
  id uuid primary key,
  usuario_id uuid not null,
  plan_id uuid not null,
  actividad_id uuid not null,
  inicia_en timestamptz not null,
  termina_en timestamptz not null,
  bloqueado boolean not null default false,
  constraint bloques_plan_tiempo_ck check (termina_en > inicia_en),
  constraint bloques_plan_plan_fk foreign key (usuario_id, plan_id)
    references dominio.planes(usuario_id, id) on delete cascade,
  constraint bloques_plan_actividad_fk foreign key (usuario_id, actividad_id)
    references dominio.actividades(usuario_id, id),
  constraint bloques_plan_usuario_id_uq unique (usuario_id, id)
);
create index bloques_plan_plan_inicio_idx on dominio.bloques_plan (usuario_id, plan_id, inicia_en, id);

create table dominio.trabajo_no_asignado (
  usuario_id uuid not null,
  plan_id uuid not null,
  actividad_id uuid not null,
  minutos integer not null check (minutos > 0),
  razon text not null check (razon in ('deadline_passed', 'insufficient_capacity', 'below_min_session')),
  primary key (usuario_id, plan_id, actividad_id),
  foreign key (usuario_id, plan_id) references dominio.planes(usuario_id, id) on delete cascade,
  foreign key (usuario_id, actividad_id) references dominio.actividades(usuario_id, id)
);

create table dominio.riesgos_plan (
  usuario_id uuid not null,
  plan_id uuid not null,
  actividad_id uuid not null,
  minutos_restantes integer not null check (minutos_restantes >= 0),
  minutos_capacidad integer not null check (minutos_capacidad >= 0),
  minutos_margen integer not null,
  nivel text not null check (nivel in ('low', 'medium', 'high')),
  razones text[] not null,
  primary key (usuario_id, plan_id, actividad_id),
  foreign key (usuario_id, plan_id) references dominio.planes(usuario_id, id) on delete cascade,
  foreign key (usuario_id, actividad_id) references dominio.actividades(usuario_id, id)
);

grant select, insert, update, delete on dominio.revisiones_planificacion, dominio.planes,
  dominio.bloques_plan, dominio.trabajo_no_asignado, dominio.riesgos_plan to notesia_app;
