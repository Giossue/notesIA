create table dominio.dispositivos_push (
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  id uuid not null,
  plataforma text not null check (plataforma in ('android', 'ios')),
  token_cifrado bytea not null,
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, id)
);
create index dispositivos_push_antiguos_idx on dominio.dispositivos_push (actualizado_en);

alter table dominio.notificaciones add constraint notificaciones_usuario_id_uq
  unique (usuario_id, id);
create table dominio.envios_push (
  id uuid primary key,
  usuario_id uuid not null,
  dispositivo_id uuid not null,
  notificacion_id uuid not null,
  estado text not null default 'pending' check (estado in ('pending','sending','done','dead')),
  intentos integer not null default 0 check (intentos >= 0),
  disponible_en timestamptz not null default now(),
  arrendado_hasta timestamptz,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  unique (notificacion_id, dispositivo_id),
  foreign key (usuario_id, dispositivo_id)
    references dominio.dispositivos_push(usuario_id, id) on delete cascade,
  foreign key (usuario_id, notificacion_id)
    references dominio.notificaciones(usuario_id, id) on delete cascade
);
create index envios_push_pendientes_idx on dominio.envios_push
  (disponible_en, id) where estado in ('pending','sending');

grant select, insert, update, delete on dominio.dispositivos_push to notesia_app;
grant select, insert, update, delete on dominio.envios_push to notesia_app;
