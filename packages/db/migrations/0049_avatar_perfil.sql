-- Avatar del perfil: el id de uno de los SVG que trae la app
-- (packages/contracts/src/avatars.generated.ts). La API valida la lista; la
-- base solo exige el formato para no acoplar migraciones a cada avatar nuevo.
alter table "dominio"."perfiles_usuario"
  add column "avatar" text not null default 'avatar-coffee-cup'
  constraint "perfiles_usuario_avatar_ck" check ("avatar" ~ '^[a-z0-9-]{1,60}$');

-- Better Auth recibe el avatar elegido al registrarse como campo adicional del
-- usuario; el trigger lo copia al perfil, que es la fuente de verdad después.
alter table "autenticacion"."usuarios" add column "avatar" text;

create or replace function "dominio"."crear_perfil_usuario"() returns trigger language plpgsql as $$
begin
  insert into "dominio"."perfiles_usuario" ("usuario_id", "nombre", "avatar")
  values (new."id", new."nombre", coalesce(new."avatar", 'avatar-coffee-cup'));
  return new;
end;
$$;
