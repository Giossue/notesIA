-- Reportes de los estudiantes (problemas, sugerencias, cuenta) que atiende soporte.
create table dominio.reportes (
  id uuid primary key,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  tipo text not null check (tipo in ('bug', 'suggestion', 'account', 'other')),
  titulo text not null check (char_length(titulo) between 1 and 160),
  descripcion text not null check (char_length(descripcion) between 1 and 5000),
  -- Datos técnicos que agrega la app (plataforma, versiones); sin datos personales.
  contexto jsonb not null default '{}'::jsonb,
  estado text not null default 'new'
    check (estado in ('new', 'in_review', 'resolved', 'closed')),
  asignado_a uuid references autenticacion.usuarios(id) on delete set null,
  respuesta text check (respuesta is null or char_length(respuesta) between 1 and 2000),
  respondido_en timestamptz,
  cerrado_en timestamptz,
  version integer not null default 1 check (version > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index reportes_usuario on dominio.reportes (usuario_id, creado_en desc);
create index reportes_estado on dominio.reportes (estado, creado_en desc);

-- Historial de cada reporte: quién lo creó, asignó, cambió de estado o respondió.
create table dominio.historial_reportes (
  id uuid primary key,
  reporte_id uuid not null references dominio.reportes(id) on delete cascade,
  actor_id uuid references autenticacion.usuarios(id) on delete set null,
  accion text not null check (accion in ('created', 'assigned', 'status_changed', 'replied')),
  detalle jsonb not null default '{}'::jsonb,
  registrado_en timestamptz not null default now()
);
create index historial_reportes_reporte on dominio.historial_reportes (reporte_id, registrado_en);

grant select, insert, update on dominio.reportes to notesia_app;
grant select, insert on dominio.historial_reportes to notesia_app;

-- Aviso al estudiante cuando soporte responde o resuelve su reporte.
alter table dominio.notificaciones add column reporte_id uuid
  references dominio.reportes(id) on delete cascade;
alter table dominio.notificaciones drop constraint notificaciones_tipo_check;
alter table dominio.notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('plan_applied', 'deadline_reminder', 'block_reminder', 'risk_alert',
    'streak_at_risk', 'report_updated'));
alter table dominio.notificaciones drop constraint notificaciones_forma_ck;
alter table dominio.notificaciones add constraint notificaciones_forma_ck check (
  (tipo = 'plan_applied' and evento_salida_id is not null and plan_id is not null
    and actividad_id is null and bloque_id is null and referencia_en is null
    and reporte_id is null)
  or (tipo = 'deadline_reminder' and evento_salida_id is null and plan_id is null
    and actividad_id is not null and bloque_id is null and referencia_en is not null
    and reporte_id is null)
  or (tipo = 'block_reminder' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is not null and referencia_en is not null
    and reporte_id is null)
  or (tipo = 'risk_alert' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is null and referencia_en is null
    and reporte_id is null)
  or (tipo = 'streak_at_risk' and evento_salida_id is null and plan_id is null
    and actividad_id is null and bloque_id is null and referencia_en is not null
    and reporte_id is null)
  or (tipo = 'report_updated' and evento_salida_id is null and plan_id is null
    and actividad_id is null and bloque_id is null and referencia_en is null
    and reporte_id is not null)
);
