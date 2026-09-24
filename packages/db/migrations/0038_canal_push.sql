alter table dominio.preferencias_usuario
  add column push_habilitado boolean not null default true;

drop trigger preferencias_revision_planificacion on dominio.preferencias_usuario;
create trigger preferencias_revision_planificacion
  after insert on dominio.preferencias_usuario
  for each row execute function dominio.avanzar_revision_planificacion();
create trigger preferencias_revision_planificacion_cambios
  after update on dominio.preferencias_usuario
  for each row when (
    old.sesion_minima is distinct from new.sesion_minima or
    old.sesion_maxima is distinct from new.sesion_maxima or
    old.maximo_diario is distinct from new.maximo_diario
  ) execute function dominio.avanzar_revision_planificacion();
