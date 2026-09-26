-- Reversión manual: desplegar primero el código anterior a 0055.
begin;
drop table dominio.planificacion_automatica;
alter table dominio.perfiles_usuario drop column onboarding_completado_en;
delete from public.migraciones where version = '0055_onboarding_plan_automatico.sql';
commit;
