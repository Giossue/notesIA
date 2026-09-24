alter table autenticacion.segundos_factores
  alter column id set default pg_catalog.gen_random_uuid();
