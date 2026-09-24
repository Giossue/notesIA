create table autenticacion.roles_usuario (
  usuario_id uuid primary key references autenticacion.usuarios(id) on delete cascade,
  rol text not null check (rol in ('admin', 'support')),
  asignado_en timestamptz not null default now()
);

create table dominio.auditoria_admin (
  id uuid primary key,
  actor_id uuid not null,
  accion text not null check (accion in ('privacy_document.created', 'privacy_document.published')),
  objetivo_id uuid not null,
  registrado_en timestamptz not null default now()
);
create index auditoria_admin_fecha_idx on dominio.auditoria_admin
  (registrado_en desc, id desc);

revoke insert, update, delete on autenticacion.roles_usuario from notesia_app;
grant select on autenticacion.roles_usuario to notesia_app;

revoke update, delete on dominio.auditoria_admin from notesia_app;
grant select, insert on dominio.auditoria_admin to notesia_app;

grant select, insert, update on dominio.documentos_privacidad to notesia_app;
revoke delete on dominio.documentos_privacidad from notesia_app;
