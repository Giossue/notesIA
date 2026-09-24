create table dominio.fallback_ia (
  id uuid primary key,
  caso text not null check (caso in ('extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks')),
  motivo text not null check (motivo in ('not_configured', 'rate_limited', 'budget_exhausted', 'invalid_output', 'provider_unavailable')),
  registrado_en timestamptz not null default now()
);
create index fallback_ia_fecha_idx on dominio.fallback_ia (registrado_en);
grant select, insert on dominio.fallback_ia to notesia_app;
revoke update, delete on dominio.fallback_ia from notesia_app;
