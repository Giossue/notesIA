-- Reversión manual local. No perder métricas existentes sin revisión.
begin;
do $$ begin
  if exists (select 1 from dominio.fallback_ia) then
    raise exception 'AI fallback metrics exist; review before rollback';
  end if;
end $$;
drop table dominio.fallback_ia;
delete from public.migraciones where version = '0037_fallback_ia.sql';
commit;
