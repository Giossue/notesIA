create table dominio.preferencias_usuario (
  usuario_id uuid primary key references autenticacion.usuarios(id) on delete cascade,
  sesion_minima integer not null default 25 check (sesion_minima between 1 and 240),
  sesion_maxima integer not null default 90 check (sesion_maxima between sesion_minima and 480),
  maximo_diario integer not null default 240 check (maximo_diario between sesion_minima and 1440),
  notificaciones_habilitadas boolean not null default true,
  minuto_silencio_inicio smallint not null default 1320 check (minuto_silencio_inicio between 0 and 1439),
  minuto_silencio_fin smallint not null default 420 check (minuto_silencio_fin between 0 and 1439),
  version integer not null default 1 check (version > 0),
  actualizado_en timestamptz not null default now(),
  constraint preferencias_silencio_ck check (minuto_silencio_inicio <> minuto_silencio_fin)
);

insert into dominio.preferencias_usuario (usuario_id)
  select id from autenticacion.usuarios on conflict do nothing;

create function dominio.crear_preferencias_usuario() returns trigger language plpgsql as $$
begin
  insert into dominio.preferencias_usuario (usuario_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger usuarios_preferencias_creadas after insert on autenticacion.usuarios
  for each row execute function dominio.crear_preferencias_usuario();
create trigger preferencias_revision_planificacion after insert or update on dominio.preferencias_usuario
  for each row execute function dominio.avanzar_revision_planificacion();

grant select, insert, update, delete on dominio.preferencias_usuario to notesia_app;
