alter table autenticacion.usuarios
  add column segundo_factor_habilitado boolean not null default false,
  add column segundo_factor_activado_en timestamptz;

create function autenticacion.registrar_activacion_segundo_factor()
returns trigger language plpgsql as $$
begin
  if new.segundo_factor_habilitado and not old.segundo_factor_habilitado then
    new.segundo_factor_activado_en := clock_timestamp();
  elsif not new.segundo_factor_habilitado then
    new.segundo_factor_activado_en := null;
  end if;
  return new;
end;
$$;

create trigger usuarios_segundo_factor_activado
before update of segundo_factor_habilitado on autenticacion.usuarios
for each row execute function autenticacion.registrar_activacion_segundo_factor();

create table autenticacion.segundos_factores (
  id uuid primary key,
  usuario_id uuid not null unique references autenticacion.usuarios(id) on delete cascade,
  secreto text not null,
  codigos_respaldo text not null,
  verificado boolean not null default true,
  fallos_verificacion integer not null default 0 check (fallos_verificacion >= 0),
  bloqueado_hasta timestamptz
);

grant select, insert, update, delete on autenticacion.segundos_factores to notesia_app;
