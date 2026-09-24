alter table dominio.historial_actividades
  drop constraint historial_actividades_tipo_evento_ck;
alter table dominio.historial_actividades
  add constraint historial_actividades_tipo_evento_ck
  check (tipo_evento in ('completed', 'reopened', 'progress_updated'));
