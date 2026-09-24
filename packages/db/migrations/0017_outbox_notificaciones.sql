create table dominio.bandeja_salida (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  tipo_evento text not null check (tipo_evento in ('plan.applied')),
  plan_id uuid not null,
  estado text not null default 'pending' check (estado in ('pending', 'done', 'dead')),
  intentos integer not null default 0 check (intentos >= 0),
  disponible_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  procesado_en timestamptz,
  constraint bandeja_salida_plan_fk foreign key (usuario_id, plan_id)
    references dominio.planes(usuario_id, id) on delete cascade,
  constraint bandeja_salida_plan_evento_uq unique (usuario_id, tipo_evento, plan_id)
);
create index bandeja_salida_pendientes_idx on dominio.bandeja_salida
  (disponible_en, id) where estado = 'pending';

create table dominio.notificaciones (
  id uuid primary key,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  evento_salida_id bigint not null unique references dominio.bandeja_salida(id) on delete cascade,
  tipo text not null check (tipo in ('plan_applied')),
  plan_id uuid not null,
  leida_en timestamptz,
  version integer not null default 1 check (version > 0),
  creada_en timestamptz not null default now(),
  constraint notificaciones_plan_fk foreign key (usuario_id, plan_id)
    references dominio.planes(usuario_id, id) on delete cascade
);
create index notificaciones_usuario_creadas_idx on dominio.notificaciones
  (usuario_id, creada_en desc, id desc);

grant select, insert, update, delete on dominio.bandeja_salida, dominio.notificaciones
  to notesia_app;
