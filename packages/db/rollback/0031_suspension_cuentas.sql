-- Reversión manual local; se niega si hubo cambios de estado auditados.
begin;
do $$ begin
  if exists (select 1 from autenticacion.usuarios
             where suspendido_en is not null or estado_version <> 1)
     or exists (select 1 from dominio.auditoria_admin
                where accion in ('account.suspended', 'account.reactivated')) then
    raise exception 'Account suspensions or audit records exist';
  end if;
end $$;
alter table dominio.auditoria_admin drop constraint auditoria_admin_accion_check;
alter table dominio.auditoria_admin add constraint auditoria_admin_accion_check
  check (accion in ('privacy_document.created', 'privacy_document.published',
    'ai_provider.updated', 'ai_route.updated', 'ai_route.tested',
    'role.assigned', 'role.changed', 'role.removed'));
drop index autenticacion.usuarios_creados_idx;
alter table autenticacion.usuarios drop column suspendido_en, drop column estado_version;
delete from public.migraciones where version = '0031_suspension_cuentas.sql';
commit;
