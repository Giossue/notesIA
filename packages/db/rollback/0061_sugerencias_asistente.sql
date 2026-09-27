-- Reversión manual: desplegar primero el código anterior a 0061.
begin;
delete from dominio.auditoria_admin where accion like 'assistant_suggestion.%';
alter table dominio.auditoria_admin drop constraint auditoria_admin_accion_check;
alter table dominio.auditoria_admin add constraint auditoria_admin_accion_check check (accion in (
  'privacy_document.created', 'privacy_document.published', 'ai_provider.updated',
  'ai_route.updated', 'ai_route.tested', 'role.assigned', 'role.changed', 'role.removed',
  'account.suspended', 'account.reactivated'
));
drop table dominio.sugerencias_asistente;
delete from public.migraciones where version = '0061_sugerencias_asistente.sql';
commit;
