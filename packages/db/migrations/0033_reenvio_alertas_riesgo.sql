drop index dominio.notificaciones_riesgo_unicas;

create index notificaciones_riesgo_recientes_idx on dominio.notificaciones
  (usuario_id, actividad_id, creada_en desc) where tipo = 'risk_alert';
