-- Reversión manual: desplegar primero el código anterior a 0060.
begin;
alter table dominio.sin_respuesta_ia rename to fallback_ia;
alter table dominio.latido_procesos rename to latido_worker;
alter table dominio.perfiles_usuario rename column configuracion_inicial_en to onboarding_completado_en;
alter table dominio.uso_ia rename column version_instrucciones to version_prompt;
delete from public.migraciones where version = '0060_nombres_en_espanol.sql';
commit;
