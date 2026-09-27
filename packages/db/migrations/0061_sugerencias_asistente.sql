-- Sugerencias que el chat del asistente muestra al empezar (3 al azar entre las
-- activas). Se gestionan desde el panel de administración.
create table dominio.sugerencias_asistente (
  id uuid primary key default gen_random_uuid(),
  texto text not null unique check (char_length(btrim(texto)) between 3 and 120),
  activa boolean not null default true,
  orden integer not null default 0,
  version integer not null default 1 check (version > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index sugerencias_asistente_activas on dominio.sugerencias_asistente (activa);
grant select, insert, update, delete on dominio.sugerencias_asistente to notesia_app;

insert into dominio.sugerencias_asistente (texto, orden) values
  ('¿Qué tengo esta semana?', 1),
  ('¿Qué entrego mañana?', 2),
  ('¿Qué tengo pendiente para hoy?', 3),
  ('¿Cuál es mi tarea más urgente?', 4),
  ('¿Qué debería hacer primero hoy?', 5),
  ('¿Tengo algo atrasado?', 6),
  ('¿Qué exámenes tengo este mes?', 7),
  ('¿Qué clases tengo mañana?', 8),
  ('¿Estoy libre el sábado en la tarde?', 9),
  ('¿Cuánto me falta para terminar mis tareas de la semana?', 10),
  ('Tengo examen de cálculo el viernes a las 10', 11),
  ('Tengo que entregar un ensayo de historia el lunes', 12),
  ('Crea una tarea para estudiar inglés mañana, una hora', 13),
  ('Anota un trabajo en grupo de física para el jueves', 14),
  ('Tengo que leer el capítulo 4 de biología antes del miércoles', 15),
  ('Recuérdame preparar la exposición de química para el martes', 16),
  ('Tengo parcial de programación la próxima semana', 17),
  ('Agrega una tarea: hacer el informe de laboratorio para el viernes', 18),
  ('Tengo que terminar el proyecto final en dos semanas', 19),
  ('Anota que debo pagar la matrícula el día 15', 20),
  ('Tengo clase de inglés mañana de 8 a 10', 21),
  ('Agrega mi trabajo del sábado de 9 a 13', 22),
  ('Tengo cita con el médico el jueves a las 4 de la tarde', 23),
  ('Anota una reunión de grupo el miércoles a las 6', 24),
  ('El viernes en la noche no estoy disponible', 25),
  ('Tengo tutoría el martes de 3 a 4', 26),
  ('Mueve mi clase de mañana a las 10', 27),
  ('Cancela la reunión del miércoles', 28),
  ('Divide mi proyecto final en pasos', 29),
  ('Ayúdame a organizar el estudio para mi examen de cálculo', 30),
  ('Dame pasos para escribir mi ensayo', 31),
  ('¿Cuánto tiempo me tomará estudiar para el parcial?', 32),
  ('¿Cuánto tiempo necesito para un informe de 5 páginas?', 33),
  ('Sube la prioridad de mi examen de física', 34),
  ('Marca como completada la lectura de inglés', 35),
  ('Ya terminé la mitad del proyecto', 36),
  ('Cambia la entrega del ensayo al viernes', 37),
  ('Elimina la tarea de química, ya no la tengo', 38),
  ('Empecé a hacer el informe de laboratorio', 39),
  ('¿Cómo puedo organizarme mejor esta semana?', 40),
  ('Tengo tres entregas el mismo día, ¿qué hago?', 41),
  ('Dame consejos para estudiar para un examen', 42),
  ('¿Cómo divido una tarea grande?', 43),
  ('Me siento atrasado, ¿por dónde empiezo?', 44),
  ('¿Cómo evito dejar todo para último momento?', 45),
  ('¿Qué técnica de estudio me recomiendas para memorizar?', 46),
  ('¿Cuántas horas debería estudiar al día?', 47),
  ('Ayúdame a priorizar mis tareas de esta semana', 48),
  ('¿Qué tareas puedo adelantar el fin de semana?', 49),
  ('Resume mi semana en tres puntos', 50);

-- Los cambios en las sugerencias quedan en la auditoría del panel.
alter table dominio.auditoria_admin drop constraint auditoria_admin_accion_check;
alter table dominio.auditoria_admin add constraint auditoria_admin_accion_check check (accion in (
  'privacy_document.created', 'privacy_document.published', 'ai_provider.updated',
  'ai_route.updated', 'ai_route.tested', 'role.assigned', 'role.changed', 'role.removed',
  'account.suspended', 'account.reactivated',
  'assistant_suggestion.created', 'assistant_suggestion.updated', 'assistant_suggestion.deleted'
));
