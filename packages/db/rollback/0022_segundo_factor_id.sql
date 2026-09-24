-- Rollback manual del valor por defecto; ejecutar antes del rollback 0021.
begin;
alter table autenticacion.segundos_factores alter column id drop default;
delete from public.migraciones where version = '0022_segundo_factor_id.sql';
commit;
