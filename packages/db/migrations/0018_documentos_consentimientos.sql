create table dominio.documentos_privacidad (
  id uuid primary key,
  tipo text not null check (tipo in ('terms', 'privacy', 'ai')),
  version integer not null check (version > 0),
  idioma text not null check (idioma in ('es', 'en')),
  contenido text not null check (length(trim(contenido)) > 0),
  publicado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (tipo, idioma, version)
);

create function dominio.proteger_documento_publicado() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.publicado_en is not null then
      raise exception 'published privacy documents are immutable';
    end if;
    return old;
  end if;
  if old.publicado_en is not null then
    raise exception 'published privacy documents are immutable';
  end if;
  return new;
end;
$$;

create trigger documentos_privacidad_inmutables
before update or delete on dominio.documentos_privacidad
for each row execute function dominio.proteger_documento_publicado();

create index documentos_privacidad_publicados_idx on dominio.documentos_privacidad
  (idioma, tipo, version desc) where publicado_en is not null;

create table dominio.consentimientos (
  id uuid primary key,
  usuario_id uuid not null references autenticacion.usuarios(id) on delete cascade,
  documento_id uuid not null references dominio.documentos_privacidad(id),
  decision text not null check (decision in ('accepted', 'revoked')),
  registrado_en timestamptz not null default now()
);

create function dominio.validar_consentimiento() returns trigger language plpgsql as $$
declare tipo_documento text;
declare fecha_publicacion timestamptz;
begin
  select tipo, publicado_en into tipo_documento, fecha_publicacion
    from dominio.documentos_privacidad where id = new.documento_id;
  if fecha_publicacion is null then
    raise exception 'consent requires a published document';
  end if;
  if new.decision = 'revoked' and tipo_documento <> 'ai' then
    raise exception 'only AI consent can be revoked';
  end if;
  return new;
end;
$$;

create trigger consentimientos_validos
before insert on dominio.consentimientos
for each row execute function dominio.validar_consentimiento();

create index consentimientos_usuario_fecha_idx on dominio.consentimientos
  (usuario_id, registrado_en desc, id desc);

revoke insert, update, delete on dominio.documentos_privacidad from notesia_app;
revoke update, delete on dominio.consentimientos from notesia_app;
grant select on dominio.documentos_privacidad to notesia_app;
grant select, insert on dominio.consentimientos to notesia_app;
