-- RF-15: el estudiante puede marcar una actividad como en progreso o volverla a
-- pendiente sin tocar su porcentaje de avance.
alter table dominio.historial_actividades
  drop constraint historial_actividades_tipo_evento_ck;

alter table dominio.historial_actividades
  add constraint historial_actividades_tipo_evento_ck
  check (tipo_evento in (
    'completed', 'reopened', 'cancelled', 'started', 'paused', 'progress_updated', 'deleted'
  ));
