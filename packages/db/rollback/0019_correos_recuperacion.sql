-- Rollback manual: se niega si existe cualquier registro de recuperación.
-- Nunca ejecutar automáticamente ni sobre producción.
begin;
do $$
begin
  if exists (select 1 from autenticacion.correos_recuperacion) then
    raise exception 'recovery rollback refused: mail history exists';
  end if;
end;
$$;
drop table autenticacion.correos_recuperacion;
delete from public.migraciones where version = '0019_correos_recuperacion.sql';
commit;
