-- Sin reversión automática: las tareas quedaron eliminadas (borrado suave) y sus
-- avisos se borraron. Si hiciera falta, se pueden restaurar a mano limpiando
-- eliminado_en de las filas con archivado_en no nulo.
begin;
delete from public.migraciones where version = '0062_tareas_sin_archivo.sql';
commit;
