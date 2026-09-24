-- Reversión manual local: rechaza reclamos en curso.
begin;
do $$ begin
  if exists (select 1 from dominio.claves_idempotencia where estado_respuesta is null) then
    raise exception 'Pending idempotency claims exist';
  end if;
end $$;
drop index dominio.claves_idempotencia_arrendadas_idx;
alter table dominio.claves_idempotencia
  drop constraint claves_idempotencia_arrendamiento_ck,
  drop column propietario_arrendamiento,
  drop column arrendado_hasta;
delete from public.migraciones where version = '0027_idempotencia_arrendamiento.sql';
commit;
