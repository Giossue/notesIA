-- Manual rollback only for an empty consent history; never run automatically.
begin;
do $$
begin
  if exists (select 1 from dominio.consentimientos) then
    raise exception 'consent ordering rollback refused: consent history exists';
  end if;
end;
$$;
drop index dominio.consentimientos_usuario_orden_idx;
alter table dominio.consentimientos drop constraint consentimientos_orden_uq;
alter table dominio.consentimientos drop column orden;
drop sequence if exists dominio.consentimientos_orden_seq;
delete from public.migraciones where version = '0039_orden_consentimientos.sql';
commit;
