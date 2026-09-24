-- Rollback manual exclusivo para una instalación sin roles ni auditoría.
-- Nunca ejecutar automáticamente ni sobre producción.
begin;
do $$
begin
  if exists (select 1 from autenticacion.roles_usuario)
     or exists (select 1 from dominio.auditoria_admin) then
    raise exception 'admin rollback refused: roles or audit history exist';
  end if;
end;
$$;
revoke insert, update on dominio.documentos_privacidad from notesia_app;
drop table dominio.auditoria_admin;
drop table autenticacion.roles_usuario;
delete from public.migraciones where version = '0020_admin_documentos.sql';
commit;
