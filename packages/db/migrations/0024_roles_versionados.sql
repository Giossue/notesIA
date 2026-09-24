alter table autenticacion.roles_usuario
  add column version integer not null default 1 check (version > 0),
  add column actualizado_en timestamptz not null default now();

alter table dominio.auditoria_admin drop constraint auditoria_admin_accion_check;
alter table dominio.auditoria_admin add constraint auditoria_admin_accion_check
  check (accion in ('privacy_document.created', 'privacy_document.published',
    'ai_provider.updated', 'ai_route.updated', 'ai_route.tested',
    'role.assigned', 'role.changed', 'role.removed'));

grant select, insert, update, delete on autenticacion.roles_usuario to notesia_app;
