-- Reversión manual local: solo si no hay configuración ni registros de uso.
begin;
do $$ begin
  if exists (select 1 from dominio.proveedores_ia) or exists (select 1 from dominio.uso_ia) then
    raise exception 'AI configuration or usage exists; export and resolve before rollback';
  end if;
end $$;
delete from dominio.auditoria_admin where accion in ('ai_provider.updated', 'ai_route.updated', 'ai_route.tested');
drop table dominio.uso_ia;
drop table dominio.rutas_ia;
drop table dominio.proveedores_ia;
alter table dominio.auditoria_admin drop constraint auditoria_admin_accion_check;
alter table dominio.auditoria_admin add constraint auditoria_admin_accion_check
  check (accion in ('privacy_document.created', 'privacy_document.published'));
delete from public.migraciones where version = '0023_ia_gateway.sql';
commit;
