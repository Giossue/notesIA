alter table autenticacion.usuarios
  add column suspendido_en timestamptz,
  add column estado_version integer not null default 1 check (estado_version > 0);
create index usuarios_creados_idx on autenticacion.usuarios (creado_en desc, id desc);

alter table dominio.auditoria_admin drop constraint auditoria_admin_accion_check;
alter table dominio.auditoria_admin add constraint auditoria_admin_accion_check
  check (accion in ('privacy_document.created', 'privacy_document.published',
    'ai_provider.updated', 'ai_route.updated', 'ai_route.tested',
    'role.assigned', 'role.changed', 'role.removed',
    'account.suspended', 'account.reactivated'));
