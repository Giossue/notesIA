alter table dominio.consentimientos add column orden bigint;

create sequence dominio.consentimientos_orden_seq as bigint;
alter sequence dominio.consentimientos_orden_seq
  owned by dominio.consentimientos.orden;

-- Existing equal timestamps have no reliable insertion order. Prefer revocation.
with ordered as (
  select id, row_number() over (
    order by registrado_en,
      case when decision = 'revoked' then 1 else 0 end, id
  ) as position
  from dominio.consentimientos
)
update dominio.consentimientos c set orden = ordered.position
  from ordered where c.id = ordered.id;

alter table dominio.consentimientos
  alter column orden set not null,
  alter column orden set default nextval('dominio.consentimientos_orden_seq');
select setval(
  'dominio.consentimientos_orden_seq',
  coalesce((select max(orden) from dominio.consentimientos), 1),
  exists(select 1 from dominio.consentimientos)
);
alter table dominio.consentimientos add constraint consentimientos_orden_uq unique (orden);
create index consentimientos_usuario_orden_idx
  on dominio.consentimientos (usuario_id, orden desc);

grant usage on sequence dominio.consentimientos_orden_seq to notesia_app;
