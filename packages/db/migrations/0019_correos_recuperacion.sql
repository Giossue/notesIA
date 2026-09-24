create table autenticacion.correos_recuperacion (
  id uuid primary key,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  contenido_cifrado bytea,
  estado text not null default 'pending'
    check (estado in ('pending', 'sending', 'done', 'dead')),
  intentos integer not null default 0 check (intentos >= 0),
  disponible_en timestamptz not null default now(),
  expira_en timestamptz not null,
  creado_en timestamptz not null default now(),
  procesado_en timestamptz,
  check ((estado in ('pending', 'sending') and contenido_cifrado is not null)
      or (estado in ('done', 'dead') and contenido_cifrado is null))
);

create index correos_recuperacion_pendientes_idx on autenticacion.correos_recuperacion
  (disponible_en, id) where estado in ('pending', 'sending');

grant select, insert, update on autenticacion.correos_recuperacion to notesia_app;
revoke delete on autenticacion.correos_recuperacion from notesia_app;
