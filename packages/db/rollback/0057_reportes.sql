-- Reversión manual: desplegar primero el código anterior a 0057.
begin;
delete from dominio.notificaciones where tipo = 'report_updated';
alter table dominio.notificaciones drop constraint notificaciones_forma_ck;
alter table dominio.notificaciones add constraint notificaciones_forma_ck check (
  (tipo = 'plan_applied' and evento_salida_id is not null and plan_id is not null
    and actividad_id is null and bloque_id is null and referencia_en is null)
  or (tipo = 'deadline_reminder' and evento_salida_id is null and plan_id is null
    and actividad_id is not null and bloque_id is null and referencia_en is not null)
  or (tipo = 'block_reminder' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is not null and referencia_en is not null)
  or (tipo = 'risk_alert' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is null and referencia_en is null)
  or (tipo = 'streak_at_risk' and evento_salida_id is null and plan_id is null
    and actividad_id is null and bloque_id is null and referencia_en is not null)
);
alter table dominio.notificaciones drop constraint notificaciones_tipo_check;
alter table dominio.notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('plan_applied', 'deadline_reminder', 'block_reminder', 'risk_alert',
    'streak_at_risk'));
alter table dominio.notificaciones drop column reporte_id;
drop table dominio.historial_reportes;
drop table dominio.reportes;
delete from public.migraciones where version = '0057_reportes.sql';
commit;
