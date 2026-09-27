-- Limpieza periódica de avisos viejos y de los envíos push ya terminados.
create index notificaciones_creadas on dominio.notificaciones (creada_en, id);
create index envios_push_terminados on dominio.envios_push (creado_en, id)
  where estado in ('done', 'dead');
