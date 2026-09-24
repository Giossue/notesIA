-- Reversión manual local: detener el worker y revisar avisos antes de retirar evaluaciones.
begin;
do $$ begin
  if exists (select 1 from dominio.riesgos_actuales) then
    raise exception 'Current risk assessments exist; review alerts before rollback';
  end if;
end $$;
drop table dominio.riesgos_actuales;
drop index dominio.planes_riesgo_comprobar_idx;
alter table dominio.planes
  drop column riesgo_revision_comprobada,
  drop column riesgo_comprobar_en;
delete from public.migraciones where version = '0035_riesgo_actual.sql';
commit;
