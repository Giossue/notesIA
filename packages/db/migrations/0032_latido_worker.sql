create table dominio.latido_worker (
  id boolean primary key default true check (id),
  visto_en timestamptz not null default now()
);
grant select, insert, update on dominio.latido_worker to notesia_app;
