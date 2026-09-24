-- Manual rollback refuses to erase uncertainty about provider outcomes.
begin;
do $$
begin
  if exists (select 1 from dominio.uso_ia where estado = 'unknown') then
    raise exception 'AI reservation rollback refused: unknown outcomes exist';
  end if;
end;
$$;
drop index dominio.uso_ia_reservas_pendientes_idx;
alter table dominio.uso_ia drop constraint uso_ia_estado_check;
alter table dominio.uso_ia add constraint uso_ia_estado_check
  check (estado in ('reserved', 'success', 'error', 'invalid', 'timeout'));
delete from public.migraciones where version = '0041_reservas_ia_inciertas.sql';
commit;
