alter table dominio.claves_idempotencia
  add column propietario_arrendamiento uuid,
  add column arrendado_hasta timestamptz;
update dominio.claves_idempotencia
  set propietario_arrendamiento = gen_random_uuid(),
      arrendado_hasta = now() + interval '2 minutes'
  where estado_respuesta is null;
alter table dominio.claves_idempotencia add constraint claves_idempotencia_arrendamiento_ck
  check ((estado_respuesta is null and propietario_arrendamiento is not null
           and arrendado_hasta is not null)
    or (estado_respuesta is not null and propietario_arrendamiento is null
           and arrendado_hasta is null));
create index claves_idempotencia_arrendadas_idx on dominio.claves_idempotencia
  (arrendado_hasta) where estado_respuesta is null;
