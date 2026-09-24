-- Reversión manual local; solo elimina el último latido operativo.
begin;
drop table dominio.latido_worker;
delete from public.migraciones where version = '0032_latido_worker.sql';
commit;
