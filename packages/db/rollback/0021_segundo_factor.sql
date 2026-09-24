-- Rollback manual exclusivo para una instalación sin cuentas con MFA.
-- Nunca ejecutar automáticamente ni sobre producción.
begin;
do $$
begin
  if exists (select 1 from public.migraciones where version = '0022_segundo_factor_id.sql') then
    raise exception 'run the 0022 rollback first';
  end if;
  if exists (select 1 from autenticacion.segundos_factores)
     or exists (select 1 from autenticacion.usuarios where segundo_factor_habilitado) then
    raise exception 'MFA rollback refused: enrolled users exist';
  end if;
end;
$$;
drop table autenticacion.segundos_factores;
drop trigger usuarios_segundo_factor_activado on autenticacion.usuarios;
drop function autenticacion.registrar_activacion_segundo_factor();
alter table autenticacion.usuarios
  drop column segundo_factor_activado_en,
  drop column segundo_factor_habilitado;
delete from public.migraciones where version = '0021_segundo_factor.sql';
commit;
