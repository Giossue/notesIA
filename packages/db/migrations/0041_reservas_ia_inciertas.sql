alter table dominio.uso_ia drop constraint uso_ia_estado_check;
alter table dominio.uso_ia add constraint uso_ia_estado_check
  check (estado in ('reserved', 'success', 'error', 'invalid', 'timeout', 'unknown'));

create index uso_ia_reservas_pendientes_idx on dominio.uso_ia (registrado_en, id)
  where estado = 'reserved';
