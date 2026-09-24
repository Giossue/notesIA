create table dominio.periodos_academicos (
  id uuid primary key,
  orden bigint generated always as identity,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  nombre varchar(120) not null check (length(btrim(nombre)) > 0),
  inicia_el date not null,
  termina_el date not null,
  version integer not null default 1 check (version > 0),
  archivado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  constraint periodos_academicos_fechas_ck check (termina_el >= inicia_el),
  constraint periodos_academicos_usuario_id_uq unique (usuario_id, id)
);
create index periodos_academicos_usuario_orden_idx on dominio.periodos_academicos
  (usuario_id, orden desc);

alter table dominio.materias add column periodo_id uuid;
alter table dominio.materias add constraint materias_periodo_propietario_fk
  foreign key (usuario_id, periodo_id)
  references dominio.periodos_academicos(usuario_id, id) on delete set null (periodo_id);
create index materias_usuario_periodo_idx on dominio.materias
  (usuario_id, periodo_id) where eliminado_en is null;

grant select, insert, update, delete on dominio.periodos_academicos to notesia_app;
