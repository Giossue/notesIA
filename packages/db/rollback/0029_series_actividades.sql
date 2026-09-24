do $$ begin
  if exists (select 1 from dominio.series_actividades)
     or exists (select 1 from dominio.actividades where serie_id is not null) then
    raise exception 'Cannot roll back activity series while data exists';
  end if;
end $$;
drop index dominio.actividades_serie_fecha_uq;
alter table dominio.actividades
  drop constraint actividades_serie_fk,
  drop constraint actividades_serie_forma_ck,
  drop column serie_id,
  drop column ocurre_el;
drop table dominio.series_actividades;
