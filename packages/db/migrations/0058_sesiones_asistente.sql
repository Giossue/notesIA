-- Conversaciones con el asistente. Cada estudiante tiene una sola sesión activa;
-- al empezar otra, la anterior se cierra y ya no se le muestra, pero queda en el
-- servidor para mejorar el asistente. Se borran con la cuenta.
create table dominio.sesiones_asistente (
  id uuid primary key,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  -- Mensajes en orden: [{ id, role, text, actions: [{ id, action, state }], at }].
  contenido jsonb not null default '[]'::jsonb check (jsonb_typeof(contenido) = 'array'),
  mensajes_usuario integer not null default 0 check (mensajes_usuario >= 0),
  estado text not null default 'active' check (estado in ('active', 'closed')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  cerrada_en timestamptz,
  check ((estado = 'closed') = (cerrada_en is not null))
);
create unique index sesiones_asistente_activa on dominio.sesiones_asistente (usuario_id)
  where estado = 'active';
create index sesiones_asistente_usuario on dominio.sesiones_asistente (usuario_id, creado_en desc);

grant select, insert, update on dominio.sesiones_asistente to notesia_app;
