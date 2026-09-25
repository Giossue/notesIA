-- El despliegue propio usa el buzón interno y no registra servicios push externos.
-- Borrar tokens cifrados también elimina sus envíos por la relación ON DELETE CASCADE.
delete from dominio.dispositivos_push;

update dominio.preferencias_usuario
set push_habilitado = false
where push_habilitado;

alter table dominio.preferencias_usuario
  alter column push_habilitado set default false;
