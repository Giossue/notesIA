-- Reversión manual: desplegar primero el código anterior a 0066.
begin;
drop table dominio.progreso_descanso_racha;
delete from public.migraciones where version = '0066_cursor_descanso_racha.sql';
commit;
