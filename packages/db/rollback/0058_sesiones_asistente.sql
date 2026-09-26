-- Reversión manual: desplegar primero el código anterior a 0058.
begin;
drop table dominio.sesiones_asistente;
delete from public.migraciones where version = '0058_sesiones_asistente.sql';
commit;
