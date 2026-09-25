-- Vuelven los avisos push (FCM) para recordatorios y alertas con la app cerrada.
-- Solo llegan a teléfonos que el estudiante registre en Notificaciones.
alter table dominio.preferencias_usuario
  alter column push_habilitado set default true;

update dominio.preferencias_usuario
set push_habilitado = true
where not push_habilitado;
