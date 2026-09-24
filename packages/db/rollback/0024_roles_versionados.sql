-- Reversión manual local; no borra registros de auditoría ni roles.
begin;
do $$ begin
  if exists (select 1 from dominio.auditoria_admin
             where accion in ('role.assigned', 'role.changed', 'role.removed')) then
    raise exception 'Role changes exist; resolve audit retention before rollback';
  end if;
end $$;
revoke insert, update, delete on autenticacion.roles_usuario from notesia_app;
alter table autenticacion.roles_usuario drop column version, drop column actualizado_en;
alter table dominio.auditoria_admin drop constraint auditoria_admin_accion_check;
alter table dominio.auditoria_admin add constraint auditoria_admin_accion_check
  check (accion in ('privacy_document.created', 'privacy_document.published',
    'ai_provider.updated', 'ai_route.updated', 'ai_route.tested'));
delete from public.migraciones where version = '0024_roles_versionados.sql';
commit;
