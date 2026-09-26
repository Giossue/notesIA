-- Índices para las claves foráneas que no tenían uno: sin ellos, borrar una cuenta
-- (cascadas) y algunas búsquedas recorren la tabla entera cuando hay muchos datos.
create index if not exists bloques_plan_actividad on dominio.bloques_plan (usuario_id, actividad_id);
create index if not exists trabajo_no_asignado_actividad
  on dominio.trabajo_no_asignado (usuario_id, actividad_id);
create index if not exists riesgos_plan_actividad on dominio.riesgos_plan (usuario_id, actividad_id);
create index if not exists bandeja_salida_plan on dominio.bandeja_salida (usuario_id, plan_id);
create index if not exists notificaciones_plan on dominio.notificaciones (usuario_id, plan_id);
create index if not exists notificaciones_reporte on dominio.notificaciones (reporte_id)
  where reporte_id is not null;
create index if not exists consentimientos_documento on dominio.consentimientos (documento_id);
create index if not exists correos_recuperacion_usuario on autenticacion.correos_recuperacion (usuario_id);
create index if not exists correos_verificacion_usuario on autenticacion.correos_verificacion (usuario_id);
create index if not exists rutas_ia_proveedor on dominio.rutas_ia (proveedor_id);
create index if not exists rutas_ia_proveedor_alterno on dominio.rutas_ia (proveedor_alterno_id)
  where proveedor_alterno_id is not null;
create index if not exists envios_push_dispositivo on dominio.envios_push (usuario_id, dispositivo_id);
create index if not exists envios_push_notificacion on dominio.envios_push (usuario_id, notificacion_id);
create index if not exists planes_base on dominio.planes (usuario_id, plan_base_id)
  where plan_base_id is not null;
create index if not exists reportes_asignado on dominio.reportes (asignado_a)
  where asignado_a is not null;
create index if not exists historial_reportes_actor on dominio.historial_reportes (actor_id)
  where actor_id is not null;
