-- Reversión manual: desplegar primero el código anterior a 0064.
begin;
drop index if exists dominio.envios_push_terminados;
drop index if exists dominio.notificaciones_creadas;
delete from public.migraciones where version = '0064_limpieza_avisos.sql';
commit;
