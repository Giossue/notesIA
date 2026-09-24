alter table dominio.planes
  add column riesgo_revision_comprobada bigint,
  add column riesgo_comprobar_en timestamptz;

create index planes_riesgo_comprobar_idx on dominio.planes
  (riesgo_comprobar_en, usuario_id, id) where estado = 'active';

create table dominio.riesgos_actuales (
  usuario_id uuid not null,
  actividad_id uuid not null,
  plan_id uuid not null,
  revision_origen bigint not null check (revision_origen >= 0),
  version_algoritmo text not null,
  minutos_restantes integer not null check (minutos_restantes >= 0),
  minutos_capacidad integer not null check (minutos_capacidad >= 0),
  minutos_margen integer not null,
  nivel text not null check (nivel in ('low', 'medium', 'high')),
  razones text[] not null,
  nivel_cambio_en timestamptz not null,
  calculado_en timestamptz not null,
  primary key (usuario_id, actividad_id),
  foreign key (usuario_id, plan_id) references dominio.planes(usuario_id, id) on delete cascade,
  foreign key (usuario_id, actividad_id)
    references dominio.actividades(usuario_id, id) on delete cascade
);

create index riesgos_actuales_plan_idx on dominio.riesgos_actuales
  (usuario_id, plan_id, nivel);

grant select, insert, update, delete on dominio.riesgos_actuales to notesia_app;
