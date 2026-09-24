-- Manual rollback removes the invariant without changing recorded time.
begin;
alter table dominio.registros_tiempo
  drop constraint registros_tiempo_usuario_intervalo_excl;
delete from public.migraciones where version = '0040_registros_tiempo_sin_solapamiento.sql';
commit;
