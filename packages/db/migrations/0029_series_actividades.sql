create table dominio.series_actividades (
  id uuid primary key,
  orden bigint generated always as identity,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  materia_id uuid,
  tipo text not null check (tipo in ('academic_task', 'personal', 'routine')),
  titulo varchar(240) not null check (length(btrim(titulo)) > 0),
  descripcion text check (descripcion is null or length(descripcion) <= 10000),
  prioridad text not null check (prioridad in ('low', 'medium', 'high', 'critical')),
  minutos_estimados integer not null check (minutos_estimados between 1 and 1440),
  frecuencia text not null check (frecuencia in ('daily', 'weekly')),
  inicia_el date not null,
  hasta_el date not null,
  zona_horaria text not null,
  cantidad_instancias integer not null check (cantidad_instancias between 1 and 60),
  creado_en timestamptz not null default now(),
  unique (usuario_id, id),
  check (hasta_el >= inicia_el and hasta_el <= inicia_el + 366),
  foreign key (usuario_id, materia_id) references dominio.materias(usuario_id, id)
    on delete set null (materia_id)
);
create index series_actividades_usuario_orden_idx on dominio.series_actividades
  (usuario_id, orden desc);

alter table dominio.actividades
  add column serie_id uuid,
  add column ocurre_el date,
  add constraint actividades_serie_forma_ck
    check ((serie_id is null and ocurre_el is null)
      or (serie_id is not null and ocurre_el is not null)),
  add constraint actividades_serie_fk foreign key (usuario_id, serie_id)
    references dominio.series_actividades(usuario_id, id) on delete cascade;
create unique index actividades_serie_fecha_uq on dominio.actividades
  (usuario_id, serie_id, ocurre_el) where serie_id is not null;

grant select, insert on dominio.series_actividades to notesia_app;
revoke update, delete on dominio.series_actividades from notesia_app;
