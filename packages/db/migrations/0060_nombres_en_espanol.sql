-- Nombres en español para las pocas tablas y columnas que quedaban en inglés.
alter table dominio.fallback_ia rename to sin_respuesta_ia;
alter table dominio.latido_worker rename to latido_procesos;
alter table dominio.perfiles_usuario rename column onboarding_completado_en to configuracion_inicial_en;
alter table dominio.uso_ia rename column version_prompt to version_instrucciones;

-- Restricciones e índices con el nombre anterior.
do $$
declare
  item record;
begin
  for item in
    select c.conrelid::regclass as tabla, c.conname as nombre,
      replace(replace(replace(c.conname, 'fallback_ia', 'sin_respuesta_ia'),
        'latido_worker', 'latido_procesos'), 'version_prompt', 'version_instrucciones') as nuevo
    from pg_constraint c
    where c.connamespace = 'dominio'::regnamespace
      and c.conname ~ '(fallback_ia|latido_worker|version_prompt)'
      and c.contype <> 'p'
  loop
    execute format('alter table %s rename constraint %I to %I', item.tabla, item.nombre, item.nuevo);
  end loop;
  for item in
    select i.indexname as nombre,
      replace(replace(i.indexname, 'fallback_ia', 'sin_respuesta_ia'),
        'latido_worker', 'latido_procesos') as nuevo
    from pg_indexes i
    where i.schemaname = 'dominio' and i.indexname ~ '(fallback_ia|latido_worker)'
  loop
    execute format('alter index dominio.%I rename to %I', item.nombre, item.nuevo);
  end loop;
end $$;
