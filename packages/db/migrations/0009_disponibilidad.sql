create table dominio.reglas_disponibilidad (
  id uuid primary key,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  minuto_inicio smallint not null check (minuto_inicio between 0 and 1439),
  minuto_fin smallint not null check (minuto_fin between 1 and 2879),
  version integer not null default 1 check (version > 0),
  archivado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  constraint reglas_disponibilidad_duracion_ck check (
    minuto_fin > minuto_inicio and minuto_fin - minuto_inicio <= 1440
  ),
  constraint reglas_disponibilidad_usuario_id_uq unique (usuario_id, id)
);
create index reglas_disponibilidad_usuario_idx on dominio.reglas_disponibilidad
  (usuario_id, dia_semana) where archivado_en is null;

create table dominio.excepciones_disponibilidad (
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  fecha date not null,
  version integer not null default 1 check (version > 0),
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, fecha)
);
create table dominio.ventanas_excepcion (
  usuario_id uuid not null,
  fecha date not null,
  posicion smallint not null check (posicion between 0 and 11),
  minuto_inicio smallint not null check (minuto_inicio between 0 and 1439),
  minuto_fin smallint not null check (minuto_fin between 1 and 1440),
  primary key (usuario_id, fecha, posicion),
  constraint ventanas_excepcion_padre_fk foreign key (usuario_id, fecha)
    references dominio.excepciones_disponibilidad(usuario_id, fecha) on delete cascade,
  constraint ventanas_excepcion_orden_ck check (minuto_fin > minuto_inicio)
);

grant select, insert, update, delete on dominio.reglas_disponibilidad,
  dominio.excepciones_disponibilidad, dominio.ventanas_excepcion to notesia_app;
