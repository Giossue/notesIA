-- Onboarding: se marca al terminar la configuración inicial (horario de estudio
-- y compromisos). Quien ya tiene horario de estudio se da por configurado.
alter table dominio.perfiles_usuario add column onboarding_completado_en timestamptz;
update dominio.perfiles_usuario profile set onboarding_completado_en = now()
where exists (
  select 1 from dominio.reglas_disponibilidad rule
  where rule.usuario_id = profile.usuario_id and rule.archivado_en is null
);

-- Planificación automática: el worker rehace el plan cuando cambian los datos
-- (revisión) o empieza un día nuevo. Guarda el último intento para no repetir
-- cálculos que no pueden cambiar.
create table dominio.planificacion_automatica (
  usuario_id uuid primary key references autenticacion.usuarios(id) on delete cascade,
  revision bigint not null,
  fecha date not null,
  intentado_en timestamptz not null default now()
);
grant select, insert, update on dominio.planificacion_automatica to notesia_app;
