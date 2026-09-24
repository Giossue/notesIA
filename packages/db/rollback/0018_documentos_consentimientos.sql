-- Rollback manual exclusivo para entornos sin documentos ni consentimientos.
-- Nunca ejecutar automáticamente ni sobre producción.
begin;
do $$
begin
  if exists (select 1 from dominio.documentos_privacidad)
     or exists (select 1 from dominio.consentimientos) then
    raise exception 'privacy rollback refused: documents or consents exist';
  end if;
end;
$$;

drop table dominio.consentimientos;
drop table dominio.documentos_privacidad;
drop function dominio.validar_consentimiento();
drop function dominio.proteger_documento_publicado();
delete from public.migraciones where version = '0018_documentos_consentimientos.sql';
commit;
