-- Reversión manual local; conserva todos los registros de uso.
begin;
drop index dominio.uso_ia_fecha_idx;
delete from public.migraciones where version = '0030_uso_ia_fecha.sql';
commit;
