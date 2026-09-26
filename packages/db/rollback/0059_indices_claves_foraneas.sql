-- Reversión manual: solo quita índices; no hay datos que perder.
begin;
drop index if exists dominio.bloques_plan_actividad, dominio.trabajo_no_asignado_actividad,
  dominio.riesgos_plan_actividad, dominio.bandeja_salida_plan, dominio.notificaciones_plan,
  dominio.notificaciones_reporte, dominio.consentimientos_documento,
  autenticacion.correos_recuperacion_usuario, autenticacion.correos_verificacion_usuario,
  dominio.rutas_ia_proveedor, dominio.rutas_ia_proveedor_alterno,
  dominio.envios_push_dispositivo, dominio.envios_push_notificacion, dominio.planes_base,
  dominio.reportes_asignado, dominio.historial_reportes_actor;
delete from public.migraciones where version = '0059_indices_claves_foraneas.sql';
commit;
