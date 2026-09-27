-- Avisos que el equipo escribe desde el panel, para un estudiante o para todos.
-- Cada anuncio crea una notificación por destinatario: queda en su historial
-- aunque el push no llegue.
create table dominio.anuncios (
  id uuid primary key,
  autor_id uuid references autenticacion.usuarios(id) on delete set null,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 60),
  cuerpo text not null check (char_length(btrim(cuerpo)) between 1 and 300),
  -- null: para todos los estudiantes.
  destinatario_id uuid references autenticacion.usuarios(id) on delete cascade,
  destinatarios integer not null default 0 check (destinatarios >= 0),
  creado_en timestamptz not null default now()
);
create index anuncios_fecha on dominio.anuncios (creado_en desc, id desc);
create index anuncios_destinatario on dominio.anuncios (destinatario_id)
  where destinatario_id is not null;
create index anuncios_autor on dominio.anuncios (autor_id) where autor_id is not null;
grant select, insert, update on dominio.anuncios to notesia_app;

alter table dominio.notificaciones add column anuncio_id uuid
  references dominio.anuncios(id) on delete cascade;
create unique index notificaciones_anuncio_unicas on dominio.notificaciones
  (usuario_id, anuncio_id) where anuncio_id is not null;
create index notificaciones_anuncio on dominio.notificaciones (anuncio_id)
  where anuncio_id is not null;
-- Contador de no leídos de la campana.
create index notificaciones_no_leidas on dominio.notificaciones (usuario_id)
  where leida_en is null;

alter table dominio.notificaciones drop constraint notificaciones_tipo_check;
alter table dominio.notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('plan_applied', 'deadline_reminder', 'block_reminder', 'risk_alert',
    'streak_at_risk', 'report_updated', 'announcement'));
alter table dominio.notificaciones drop constraint notificaciones_forma_ck;
alter table dominio.notificaciones add constraint notificaciones_forma_ck check (
  (tipo = 'plan_applied' and evento_salida_id is not null and plan_id is not null
    and actividad_id is null and bloque_id is null and referencia_en is null
    and reporte_id is null and anuncio_id is null)
  or (tipo = 'deadline_reminder' and evento_salida_id is null and plan_id is null
    and actividad_id is not null and bloque_id is null and referencia_en is not null
    and reporte_id is null and anuncio_id is null)
  or (tipo = 'block_reminder' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is not null and referencia_en is not null
    and reporte_id is null and anuncio_id is null)
  or (tipo = 'risk_alert' and evento_salida_id is null and plan_id is not null
    and actividad_id is not null and bloque_id is null and referencia_en is null
    and reporte_id is null and anuncio_id is null)
  or (tipo = 'streak_at_risk' and evento_salida_id is null and plan_id is null
    and actividad_id is null and bloque_id is null and referencia_en is not null
    and reporte_id is null and anuncio_id is null)
  or (tipo = 'report_updated' and evento_salida_id is null and plan_id is null
    and actividad_id is null and bloque_id is null and referencia_en is null
    and reporte_id is not null and anuncio_id is null)
  or (tipo = 'announcement' and evento_salida_id is null and plan_id is null
    and actividad_id is null and bloque_id is null and referencia_en is null
    and reporte_id is null and anuncio_id is not null)
);

alter table dominio.auditoria_admin drop constraint auditoria_admin_accion_check;
alter table dominio.auditoria_admin add constraint auditoria_admin_accion_check check (accion in (
  'privacy_document.created', 'privacy_document.published', 'ai_provider.updated',
  'ai_route.updated', 'ai_route.tested', 'role.assigned', 'role.changed', 'role.removed',
  'account.suspended', 'account.reactivated',
  'assistant_suggestion.created', 'assistant_suggestion.updated', 'assistant_suggestion.deleted',
  'announcement.sent'
));
