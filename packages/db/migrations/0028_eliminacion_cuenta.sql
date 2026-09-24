create table dominio.solicitudes_eliminacion (
  usuario_id uuid primary key references autenticacion.usuarios(id) on delete cascade,
  estado text not null default 'pending' check (estado in ('pending', 'blocked')),
  motivo_bloqueo text check (motivo_bloqueo in ('last_admin', 'policy_mismatch')),
  politica_hash bytea not null check (octet_length(politica_hash) = 32),
  solicitada_en timestamptz not null,
  ejecutar_en timestamptz not null,
  check (ejecutar_en > solicitada_en),
  check ((estado = 'pending' and motivo_bloqueo is null)
    or (estado = 'blocked' and motivo_bloqueo is not null))
);
create index solicitudes_eliminacion_pendientes_idx on dominio.solicitudes_eliminacion
  (ejecutar_en, usuario_id) where estado = 'pending';

-- No foreign key or raw account identifier survives account deletion.
create table dominio.auditoria_eliminaciones (
  id uuid primary key,
  sujeto_hash bytea not null check (octet_length(sujeto_hash) = 32),
  accion text not null check (accion in ('requested', 'cancelled', 'completed')),
  registrada_en timestamptz not null,
  expira_en timestamptz not null,
  check (expira_en > registrada_en)
);
create index auditoria_eliminaciones_expiracion_idx on dominio.auditoria_eliminaciones
  (expira_en);

-- Runtime can append audit events but can only purge rows after their recorded retention.
create function dominio.purgar_auditoria_eliminaciones()
returns integer language plpgsql security definer set search_path = pg_catalog, dominio as $$
declare deleted_count integer;
begin
  delete from dominio.auditoria_eliminaciones where expira_en <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function dominio.purgar_auditoria_eliminaciones() from public;
grant execute on function dominio.purgar_auditoria_eliminaciones() to notesia_app;

grant select, insert, update, delete on dominio.solicitudes_eliminacion to notesia_app;
grant select, insert on dominio.auditoria_eliminaciones to notesia_app;
revoke update, delete on dominio.auditoria_eliminaciones from notesia_app;
