-- Reversión manual: cerrar el registro y desplegar primero el código anterior a 0044.
begin;
do $$
begin
  if exists (select 1 from autenticacion.correos_verificacion) then
    raise exception '0044 rollback refused: verification mail records exist';
  end if;
end $$;

drop table autenticacion.correos_verificacion;
delete from public.migraciones where version = '0044_correos_verificacion.sql';
commit;
