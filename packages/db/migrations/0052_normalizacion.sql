-- Normalización e integridad del esquema.

-- 1. Materias y periodos académicos fueron retirados del producto: se eliminan
--    sus columnas de referencia, sus tablas y la función/extensión que solo
--    existían para el índice de nombre normalizado de materias.
alter table "dominio"."actividades" drop constraint if exists "actividades_materia_propietario_fk";
alter table "dominio"."eventos_calendario" drop constraint if exists "eventos_calendario_materia_propietario_fk";
alter table "dominio"."series_actividades" drop constraint if exists "series_actividades_usuario_id_materia_id_fkey";
drop index if exists "dominio"."actividades_materia_idx";
alter table "dominio"."actividades" drop column if exists "materia_id";
alter table "dominio"."eventos_calendario" drop column if exists "materia_id";
alter table "dominio"."series_actividades" drop column if exists "materia_id";

drop table "dominio"."materias";
drop table "dominio"."periodos_academicos";
drop function "dominio"."normalizar_nombre"(text);
drop extension if exists "unaccent";

-- 2. Una cuenta de proveedor pertenece a un solo usuario.
alter table "autenticacion"."cuentas"
  add constraint "cuentas_proveedor_cuenta_uq" unique ("proveedor_id", "cuenta_id");

-- 3. El perfil es la fuente de verdad del nombre visible y del avatar.
--    usuarios.nombre se conserva porque Better Auth lo exige, pero se mantiene
--    igual al perfil en ambas direcciones (IS DISTINCT FROM evita ciclos).
--    usuarios.avatar solo transporta el avatar elegido al registrarse: el
--    trigger lo copia al perfil y lo deja en NULL en la misma transacción.
--    Ningún código de la aplicación escribe usuarios.avatar ni usuarios.imagen.
update "autenticacion"."usuarios" u
  set "nombre" = p."nombre"
  from "dominio"."perfiles_usuario" p
  where p."usuario_id" = u."id" and u."nombre" is distinct from p."nombre";
update "autenticacion"."usuarios" set "avatar" = null where "avatar" is not null;

create or replace function "dominio"."crear_perfil_usuario"() returns trigger language plpgsql as $$
begin
  insert into "dominio"."perfiles_usuario" ("usuario_id", "nombre", "avatar")
  values (new."id", new."nombre", coalesce(new."avatar", 'avatar-coffee-cup'));
  -- El avatar ya vive en el perfil; no se duplica en usuarios.
  if new."avatar" is not null then
    update "autenticacion"."usuarios" set "avatar" = null where "id" = new."id";
  end if;
  return new;
end;
$$;

create function "dominio"."sincronizar_nombre_desde_perfil"() returns trigger language plpgsql as $$
begin
  update "autenticacion"."usuarios"
    set "nombre" = new."nombre", "actualizado_en" = now()
    where "id" = new."usuario_id" and "nombre" is distinct from new."nombre";
  return new;
end;
$$;

create trigger "perfiles_nombre_sincronizado"
  after update of "nombre" on "dominio"."perfiles_usuario"
  for each row when (old."nombre" is distinct from new."nombre")
  execute function "dominio"."sincronizar_nombre_desde_perfil"();

create function "autenticacion"."sincronizar_nombre_hacia_perfil"() returns trigger language plpgsql as $$
begin
  update "dominio"."perfiles_usuario"
    set "nombre" = new."nombre", "version" = "version" + 1, "actualizado_en" = now()
    where "usuario_id" = new."id" and "nombre" is distinct from new."nombre";
  return new;
end;
$$;

create trigger "usuarios_nombre_sincronizado"
  after update of "nombre" on "autenticacion"."usuarios"
  for each row when (old."nombre" is distinct from new."nombre")
  execute function "autenticacion"."sincronizar_nombre_hacia_perfil"();

-- 4. La duración de un registro de tiempo se deriva de sus instantes.
alter table "dominio"."registros_tiempo" drop constraint "registros_tiempo_duracion_ck";
alter table "dominio"."registros_tiempo" drop column "duracion_segundos";
alter table "dominio"."registros_tiempo"
  add column "duracion_segundos" integer generated always as (
    case when "termina_en" is null then null
    else greatest(1, floor(extract(epoch from ("termina_en" - "inicia_en"))))::integer end
  ) stored;
alter table "dominio"."registros_tiempo"
  add constraint "registros_tiempo_duracion_ck"
  check (("termina_en" is null and "origen" = 'timer') or "termina_en" > "inicia_en");

-- 5. Borrar un plan base no bloquea: sus derivados pierden solo la referencia.
alter table "dominio"."planes" drop constraint "planes_base_fk";
alter table "dominio"."planes"
  add constraint "planes_base_fk" foreign key ("usuario_id", "plan_base_id")
  references "dominio"."planes" ("usuario_id", "id") on delete set null ("plan_base_id");

-- 6. Una transición de IA no sobrevive a los usos que la componen.
alter table "dominio"."transiciones_ia" drop constraint "transiciones_ia_uso_origen_id_fkey";
alter table "dominio"."transiciones_ia" drop constraint "transiciones_ia_uso_destino_id_fkey";
alter table "dominio"."transiciones_ia"
  add constraint "transiciones_ia_uso_origen_id_fkey" foreign key ("uso_origen_id")
  references "dominio"."uso_ia" ("id") on delete cascade;
alter table "dominio"."transiciones_ia"
  add constraint "transiciones_ia_uso_destino_id_fkey" foreign key ("uso_destino_id")
  references "dominio"."uso_ia" ("id") on delete cascade;

-- 7. usuarios.segundo_factor_habilitado NO se deriva de segundos_factores:
--    Better Auth crea la fila no verificada antes de habilitar, habilita el
--    método OTP sin fila y gestiona el indicador junto con la sesión.
