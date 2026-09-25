-- Reversión manual: desplegar primero el código anterior a 0043.
begin;
alter table dominio.envios_push
  drop constraint envios_push_traza_check,
  drop column span_origen_id,
  drop column traza_id;
alter table autenticacion.correos_recuperacion
  drop constraint correos_recuperacion_traza_check,
  drop column span_origen_id,
  drop column traza_id;
alter table dominio.bandeja_salida
  drop constraint bandeja_salida_traza_check,
  drop column span_origen_id,
  drop column traza_id;
delete from public.migraciones where version = '0043_contexto_trazas.sql';
commit;
