-- Reversión manual: desplegar primero el código anterior a 0063.
begin;
delete from dominio.auditoria_admin where accion = 'announcement.sent';
alter table dominio.auditoria_admin drop constraint auditoria_admin_accion_check;
alter table dominio.auditoria_admin add constraint auditoria_admin_accion_check check (accion in (
  'privacy_document.created', 'privacy_document.published', 'ai_provider.updated',
  'ai_route.updated', 'ai_route.tested', 'role.assigned', 'role.changed', 'role.removed',
  'account.suspended', 'account.reactivated',
  'assistant_suggestion.created', 'assistant_suggestion.updated', 'assistant_suggestion.deleted'
));
delete from dominio.notificaciones where tipo = 'announcement';
alter table dominio.notificaciones drop constraint notificaciones_forma_ck;
alter table dominio.notificaciones add constraint notificaciones_forma_ck check (
  (tipo = 'plan_applied' and evento_salida_id is not null and plan_id is not null
    and actividad_id is null and bloque_id is null and referencia_en is null
    and reporte_id is null)
  or (tipo = 'deadline_reminder' and evento_salida_id is null and plan_id is null
    and actividad_id is not null and bloque_id is null and referencia_en is not null
    and reporte_id is null)
  or (tipo = 'block_reminder' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is not null and referencia_en is not null
    and reporte_id is null)
  or (tipo = 'risk_alert' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is null and referencia_en is null
    and reporte_id is null)
  or (tipo = 'streak_at_risk' and evento_salida_id is null and plan_id is null
    and actividad_id is null and bloque_id is null and referencia_en is not null
    and reporte_id is null)
  or (tipo = 'report_updated' and evento_salida_id is null and plan_id is null
    and actividad_id is null and bloque_id is null and referencia_en is null
    and reporte_id is not null)
);
alter table dominio.notificaciones drop constraint notificaciones_tipo_check;
alter table dominio.notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('plan_applied', 'deadline_reminder', 'block_reminder', 'risk_alert',
    'streak_at_risk', 'report_updated'));
drop index if exists dominio.notificaciones_no_leidas;
alter table dominio.notificaciones drop column anuncio_id;
drop table dominio.anuncios;
delete from public.migraciones where version = '0063_anuncios.sql';
commit;
