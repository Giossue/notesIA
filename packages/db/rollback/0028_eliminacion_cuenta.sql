do $$ begin
  if exists (select 1 from dominio.solicitudes_eliminacion)
     or exists (select 1 from dominio.auditoria_eliminaciones) then
    raise exception 'Cannot roll back account deletion after requests or audit events';
  end if;
end $$;
drop function dominio.purgar_auditoria_eliminaciones();
drop table dominio.auditoria_eliminaciones;
drop table dominio.solicitudes_eliminacion;
