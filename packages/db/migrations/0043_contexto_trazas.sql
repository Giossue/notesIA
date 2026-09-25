alter table dominio.bandeja_salida
  add column traza_id char(32),
  add column span_origen_id char(16),
  add constraint bandeja_salida_traza_check check (
    (traza_id is null and span_origen_id is null)
    or (traza_id ~ '^[0-9a-f]{32}$' and traza_id <> repeat('0', 32)
      and span_origen_id ~ '^[0-9a-f]{16}$' and span_origen_id <> repeat('0', 16))
  );

alter table autenticacion.correos_recuperacion
  add column traza_id char(32),
  add column span_origen_id char(16),
  add constraint correos_recuperacion_traza_check check (
    (traza_id is null and span_origen_id is null)
    or (traza_id ~ '^[0-9a-f]{32}$' and traza_id <> repeat('0', 32)
      and span_origen_id ~ '^[0-9a-f]{16}$' and span_origen_id <> repeat('0', 16))
  );

alter table dominio.envios_push
  add column traza_id char(32),
  add column span_origen_id char(16),
  add constraint envios_push_traza_check check (
    (traza_id is null and span_origen_id is null)
    or (traza_id ~ '^[0-9a-f]{32}$' and traza_id <> repeat('0', 32)
      and span_origen_id ~ '^[0-9a-f]{16}$' and span_origen_id <> repeat('0', 16))
  );
