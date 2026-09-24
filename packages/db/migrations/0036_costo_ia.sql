alter table dominio.rutas_ia
  add column precio_entrada_usd_millon numeric(12,6),
  add column precio_salida_usd_millon numeric(12,6),
  add constraint rutas_ia_precio_entrada_check check (precio_entrada_usd_millon >= 0),
  add constraint rutas_ia_precio_salida_check check (precio_salida_usd_millon >= 0);

alter table dominio.uso_ia
  add column precio_entrada_usd_millon numeric(12,6),
  add column precio_salida_usd_millon numeric(12,6),
  add column uso_reportado boolean not null default false,
  add column costo_usd numeric(24,9),
  add constraint uso_ia_precio_entrada_check check (precio_entrada_usd_millon >= 0),
  add constraint uso_ia_precio_salida_check check (precio_salida_usd_millon >= 0),
  add constraint uso_ia_costo_check check (costo_usd >= 0);
