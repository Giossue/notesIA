-- Las materias se identifican solo por su nombre: se elimina el código y el
-- nombre pasa a ser único por usuario entre las materias activas, sin
-- distinguir mayúsculas. Las archivadas no bloquean reutilizar el nombre.
drop index "dominio"."materias_usuario_codigo_activo_uq";
alter table "dominio"."materias" drop column "codigo";

create unique index "materias_usuario_nombre_activo_uq" on "dominio"."materias"
  ("usuario_id", lower("nombre"))
  where "archivado_en" is null and "eliminado_en" is null;
