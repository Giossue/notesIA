-- Hasta qué fecha local se evaluó si había tareas disponibles. Permite recuperar
-- días pendientes cuando el worker estuvo detenido, sin reevaluar días perdidos.
create table dominio.progreso_descanso_racha (
  usuario_id uuid primary key references autenticacion.usuarios(id) on delete cascade,
  evaluado_hasta date not null
);

-- La clasificación de descansos empieza el día en que se instaló la regla.
insert into dominio.progreso_descanso_racha (usuario_id, evaluado_hasta)
select profile.usuario_id,
  (now() at time zone profile.zona_horaria)::date - 1
from dominio.perfiles_usuario profile;

grant select, insert, update on dominio.progreso_descanso_racha to notesia_app;
