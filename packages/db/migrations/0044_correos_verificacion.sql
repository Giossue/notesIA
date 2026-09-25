create table autenticacion.correos_verificacion (
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
  traza_id char(32),
  span_origen_id char(16),
  check (expira_en > creado_en),
  check (contenido_cifrado is null or octet_length(contenido_cifrado) <= 4096),
  check ((estado in ('pending', 'sending') and contenido_cifrado is not null)
      or (estado in ('done', 'dead') and contenido_cifrado is null)),
  constraint correos_verificacion_traza_check check (
    (traza_id is null and span_origen_id is null)
    or (traza_id ~ '^[0-9a-f]{32}$' and traza_id <> repeat('0', 32)
      and span_origen_id ~ '^[0-9a-f]{16}$' and span_origen_id <> repeat('0', 16))
  )
);

create index correos_verificacion_pendientes_idx on autenticacion.correos_verificacion
  (disponible_en, id) where estado in ('pending', 'sending');

grant select, insert, update on autenticacion.correos_verificacion to notesia_app;
revoke delete on autenticacion.correos_verificacion from notesia_app;
