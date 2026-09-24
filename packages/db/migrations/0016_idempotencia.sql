create table dominio.claves_idempotencia (
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  clave uuid not null,
  metodo varchar(8) not null,
  ruta text not null,
  hash_peticion char(64) not null,
  estado_respuesta integer,
  cuerpo_respuesta jsonb,
  tipo_contenido text,
  creada_en timestamptz not null default now(),
  expira_en timestamptz not null default now() + interval '24 hours',
  primary key (usuario_id, clave),
  constraint claves_idempotencia_respuesta_ck check (
    (estado_respuesta is null and cuerpo_respuesta is null)
    or (estado_respuesta between 200 and 499 and cuerpo_respuesta is not null)
  )
);
create index claves_idempotencia_expira_idx on dominio.claves_idempotencia (expira_en);
grant select, insert, update, delete on dominio.claves_idempotencia to notesia_app;
