alter table dominio.rutas_ia
  add column proveedor_alterno_id uuid references dominio.proveedores_ia(id),
  add column modelo_alterno_id text,
  add column tiempo_limite_alterno_ms integer,
  add column maximo_salida_alterno_tokens integer,
  add column precio_entrada_alterno_usd_millon numeric(12,6),
  add column precio_salida_alterno_usd_millon numeric(12,6),
  add constraint rutas_ia_alterna_completa_check check (
    (proveedor_alterno_id is null and modelo_alterno_id is null
      and tiempo_limite_alterno_ms is null and maximo_salida_alterno_tokens is null
      and precio_entrada_alterno_usd_millon is null
      and precio_salida_alterno_usd_millon is null)
    or (proveedor_alterno_id is not null and proveedor_alterno_id <> proveedor_id
      and modelo_alterno_id is not null and length(trim(modelo_alterno_id)) between 3 and 120
      and tiempo_limite_alterno_ms is not null
      and tiempo_limite_alterno_ms between 1000 and 30000
      and maximo_salida_alterno_tokens is not null
      and maximo_salida_alterno_tokens between 64 and 2048
      and precio_entrada_alterno_usd_millon is not null
      and precio_entrada_alterno_usd_millon >= 0
      and precio_salida_alterno_usd_millon is not null
      and precio_salida_alterno_usd_millon >= 0)
  );

create table dominio.transiciones_ia (
  id uuid primary key,
  uso_origen_id uuid not null unique references dominio.uso_ia(id),
  uso_destino_id uuid not null unique references dominio.uso_ia(id),
  caso text not null check (caso in ('extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks')),
  proveedor_origen text not null check (proveedor_origen in ('openai', 'anthropic', 'deepseek')),
  proveedor_destino text not null check (proveedor_destino in ('openai', 'anthropic', 'deepseek')),
  motivo text not null check (motivo in ('invalid_output', 'provider_unavailable')),
  registrado_en timestamptz not null default now(),
  check (uso_origen_id <> uso_destino_id and proveedor_origen <> proveedor_destino)
);
create index transiciones_ia_fecha_idx on dominio.transiciones_ia (registrado_en);
grant select, insert on dominio.transiciones_ia to notesia_app;
revoke update, delete on dominio.transiciones_ia from notesia_app;
