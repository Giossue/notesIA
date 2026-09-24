create table dominio.proveedores_ia (
  id uuid primary key,
  proveedor text not null unique check (proveedor in ('openai', 'anthropic', 'deepseek')),
  clave_cifrada bytea not null,
  habilitado boolean not null default false,
  actualizado_en timestamptz not null default now()
);

create table dominio.rutas_ia (
  caso text primary key check (caso in ('extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks')),
  proveedor_id uuid not null references dominio.proveedores_ia(id),
  modelo_id text not null check (length(trim(modelo_id)) between 3 and 120),
  tiempo_limite_ms integer not null check (tiempo_limite_ms between 1000 and 30000),
  maximo_salida_tokens integer not null check (maximo_salida_tokens between 64 and 2048),
  presupuesto_diario_tokens integer not null check (presupuesto_diario_tokens between 100 and 10000000),
  habilitado boolean not null default false,
  actualizado_en timestamptz not null default now()
);

create table dominio.uso_ia (
  id uuid primary key,
  usuario_id uuid references autenticacion.usuarios(id) on delete set null,
  caso text not null check (caso in ('extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks')),
  proveedor text not null check (proveedor in ('openai', 'anthropic', 'deepseek')),
  modelo_id text not null,
  version_prompt integer not null check (version_prompt > 0),
  estado text not null check (estado in ('reserved', 'success', 'error', 'invalid', 'timeout')),
  tokens_reservados integer not null check (tokens_reservados >= 0),
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida integer not null default 0 check (tokens_salida >= 0),
  duracion_ms integer check (duracion_ms >= 0),
  registrado_en timestamptz not null default now()
);
create index uso_ia_presupuesto_idx on dominio.uso_ia (caso, registrado_en);
create index uso_ia_usuario_idx on dominio.uso_ia (usuario_id, registrado_en desc);

alter table dominio.auditoria_admin drop constraint auditoria_admin_accion_check;
alter table dominio.auditoria_admin add constraint auditoria_admin_accion_check
  check (accion in ('privacy_document.created', 'privacy_document.published',
    'ai_provider.updated', 'ai_route.updated', 'ai_route.tested'));

grant select, insert, update on dominio.proveedores_ia to notesia_app;
grant select, insert, update on dominio.rutas_ia to notesia_app;
grant select, insert, update on dominio.uso_ia to notesia_app;
revoke delete on dominio.proveedores_ia, dominio.rutas_ia, dominio.uso_ia from notesia_app;
