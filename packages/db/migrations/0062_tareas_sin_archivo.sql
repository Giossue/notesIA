-- Las tareas ya no se archivan: las que estaban archivadas pasan a eliminadas
-- (borrado suave, con su historial) y se quitan sus avisos.
with archived as (
  update dominio.actividades
  set eliminado_en = now(), version = version + 1, actualizado_en = now()
  where archivado_en is not null and eliminado_en is null
  returning usuario_id, id, estado, porcentaje_progreso
)
insert into dominio.historial_actividades
  (usuario_id, actividad_id, mutacion_id, tipo_evento,
   estado_anterior, estado_posterior, progreso_anterior, progreso_posterior)
select usuario_id, id, gen_random_uuid(), 'deleted',
  estado, estado, porcentaje_progreso, porcentaje_progreso
from archived;

delete from dominio.notificaciones n
using dominio.actividades a
where a.usuario_id = n.usuario_id and a.id = n.actividad_id and a.eliminado_en is not null;
