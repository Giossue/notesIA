-- Renombra esquemas, tablas, columnas, índices, restricciones y trigger al español.
-- Los valores de los enums (estado, prioridad, tipo) no cambian: viajan por la API.

-- Esquemas -----------------------------------------------------------------
alter schema "auth" rename to "autenticacion";
alter schema "domain" rename to "dominio";

-- Better Auth: usuarios ----------------------------------------------------
alter table "autenticacion"."user" rename to "usuarios";
alter table "autenticacion"."usuarios" rename column "name" to "nombre";
alter table "autenticacion"."usuarios" rename column "email" to "correo";
alter table "autenticacion"."usuarios" rename column "emailVerified" to "correo_verificado";
alter table "autenticacion"."usuarios" rename column "image" to "imagen";
alter table "autenticacion"."usuarios" rename column "createdAt" to "creado_en";
alter table "autenticacion"."usuarios" rename column "updatedAt" to "actualizado_en";
alter table "autenticacion"."usuarios" rename constraint "user_pkey" to "usuarios_pkey";
alter table "autenticacion"."usuarios" rename constraint "user_email_key" to "usuarios_correo_key";

-- Better Auth: cuentas -----------------------------------------------------
alter table "autenticacion"."account" rename to "cuentas";
alter table "autenticacion"."cuentas" rename column "accountId" to "cuenta_id";
alter table "autenticacion"."cuentas" rename column "providerId" to "proveedor_id";
alter table "autenticacion"."cuentas" rename column "userId" to "usuario_id";
alter table "autenticacion"."cuentas" rename column "accessToken" to "token_acceso";
alter table "autenticacion"."cuentas" rename column "refreshToken" to "token_refresco";
alter table "autenticacion"."cuentas" rename column "idToken" to "token_id";
alter table "autenticacion"."cuentas" rename column "accessTokenExpiresAt" to "token_acceso_expira_en";
alter table "autenticacion"."cuentas" rename column "refreshTokenExpiresAt" to "token_refresco_expira_en";
alter table "autenticacion"."cuentas" rename column "scope" to "alcance";
alter table "autenticacion"."cuentas" rename column "password" to "contrasena";
alter table "autenticacion"."cuentas" rename column "createdAt" to "creado_en";
alter table "autenticacion"."cuentas" rename column "updatedAt" to "actualizado_en";
alter table "autenticacion"."cuentas" rename constraint "account_pkey" to "cuentas_pkey";
alter table "autenticacion"."cuentas" rename constraint "account_userId_fkey" to "cuentas_usuario_fk";
alter index "autenticacion"."account_userId_idx" rename to "cuentas_usuario_idx";

-- Better Auth: verificaciones ---------------------------------------------
alter table "autenticacion"."verification" rename to "verificaciones";
alter table "autenticacion"."verificaciones" rename column "identifier" to "identificador";
alter table "autenticacion"."verificaciones" rename column "value" to "valor";
alter table "autenticacion"."verificaciones" rename column "expiresAt" to "expira_en";
alter table "autenticacion"."verificaciones" rename column "createdAt" to "creado_en";
alter table "autenticacion"."verificaciones" rename column "updatedAt" to "actualizado_en";
alter table "autenticacion"."verificaciones" rename constraint "verification_pkey" to "verificaciones_pkey";
alter index "autenticacion"."verification_identifier_idx" rename to "verificaciones_identificador_idx";

-- Sesiones cifradas ---------------------------------------------------------
alter table "autenticacion"."secure_store" rename to "almacen_seguro";
alter table "autenticacion"."almacen_seguro" rename column "key_hash" to "clave_hash";
alter table "autenticacion"."almacen_seguro" rename column "payload" to "contenido";
alter table "autenticacion"."almacen_seguro" rename column "expires_at" to "expira_en";
alter table "autenticacion"."almacen_seguro" rename column "counter" to "contador";
alter table "autenticacion"."almacen_seguro" rename constraint "secure_store_pkey" to "almacen_seguro_pkey";
alter index "autenticacion"."secure_store_expires_at_idx" rename to "almacen_seguro_expira_en_idx";

-- Perfiles ------------------------------------------------------------------
alter table "dominio"."user_profiles" rename to "perfiles_usuario";
alter table "dominio"."perfiles_usuario" rename column "user_id" to "usuario_id";
alter table "dominio"."perfiles_usuario" rename column "display_name" to "nombre";
alter table "dominio"."perfiles_usuario" rename column "language" to "idioma";
alter table "dominio"."perfiles_usuario" rename column "time_zone" to "zona_horaria";
alter table "dominio"."perfiles_usuario" rename column "created_at" to "creado_en";
alter table "dominio"."perfiles_usuario" rename column "updated_at" to "actualizado_en";
alter table "dominio"."perfiles_usuario" rename constraint "user_profiles_pkey" to "perfiles_usuario_pkey";
alter table "dominio"."perfiles_usuario" rename constraint "user_profiles_user_id_fkey" to "perfiles_usuario_usuario_fk";
alter table "dominio"."perfiles_usuario" rename constraint "user_profiles_language_check" to "perfiles_usuario_idioma_ck";
alter table "dominio"."perfiles_usuario" rename constraint "user_profiles_version_check" to "perfiles_usuario_version_ck";

drop trigger "auth_user_profile_created" on "autenticacion"."usuarios";
drop function "dominio"."create_user_profile"();

create function "dominio"."crear_perfil_usuario"() returns trigger language plpgsql as $$
begin
  insert into "dominio"."perfiles_usuario" ("usuario_id", "nombre") values (new."id", new."nombre");
  return new;
end;
$$;

create trigger "usuarios_perfil_creado"
after insert on "autenticacion"."usuarios"
for each row execute function "dominio"."crear_perfil_usuario"();

-- Materias ------------------------------------------------------------------
alter table "dominio"."subjects" rename to "materias";
alter table "dominio"."materias" rename column "sort_order" to "orden";
alter table "dominio"."materias" rename column "user_id" to "usuario_id";
alter table "dominio"."materias" rename column "name" to "nombre";
alter table "dominio"."materias" rename column "code" to "codigo";
alter table "dominio"."materias" rename column "color_token" to "color";
alter table "dominio"."materias" rename column "created_at" to "creado_en";
alter table "dominio"."materias" rename column "updated_at" to "actualizado_en";
alter table "dominio"."materias" rename column "archived_at" to "archivado_en";
alter table "dominio"."materias" rename column "deleted_at" to "eliminado_en";
alter table "dominio"."materias" rename constraint "subjects_pkey" to "materias_pkey";
alter table "dominio"."materias" rename constraint "subjects_user_id_fkey" to "materias_usuario_fk";
alter table "dominio"."materias" rename constraint "subjects_user_id_id_uq" to "materias_usuario_id_uq";
alter table "dominio"."materias" rename constraint "subjects_color_token_check" to "materias_color_ck";
alter table "dominio"."materias" rename constraint "subjects_version_check" to "materias_version_ck";
alter index "dominio"."subjects_user_created_idx" rename to "materias_usuario_creado_idx";
alter index "dominio"."subjects_user_code_active_uq" rename to "materias_usuario_codigo_activo_uq";
alter index "dominio"."subjects_sort_order_uq" rename to "materias_orden_uq";
alter index "dominio"."subjects_user_sort_idx" rename to "materias_usuario_orden_idx";

-- Actividades ---------------------------------------------------------------
alter table "dominio"."activities" rename to "actividades";
alter table "dominio"."actividades" rename column "sort_order" to "orden";
alter table "dominio"."actividades" rename column "user_id" to "usuario_id";
alter table "dominio"."actividades" rename column "subject_id" to "materia_id";
alter table "dominio"."actividades" rename column "kind" to "tipo";
alter table "dominio"."actividades" rename column "title" to "titulo";
alter table "dominio"."actividades" rename column "description" to "descripcion";
alter table "dominio"."actividades" rename column "status" to "estado";
alter table "dominio"."actividades" rename column "priority" to "prioridad";
alter table "dominio"."actividades" rename column "start_after_at" to "inicio_minimo";
alter table "dominio"."actividades" rename column "deadline_at" to "fecha_limite";
alter table "dominio"."actividades" rename column "estimated_minutes" to "minutos_estimados";
alter table "dominio"."actividades" rename column "progress_percent" to "porcentaje_progreso";
alter table "dominio"."actividades" rename column "completed_at" to "completado_en";
alter table "dominio"."actividades" rename column "archived_at" to "archivado_en";
alter table "dominio"."actividades" rename column "deleted_at" to "eliminado_en";
alter table "dominio"."actividades" rename column "created_at" to "creado_en";
alter table "dominio"."actividades" rename column "updated_at" to "actualizado_en";
alter table "dominio"."actividades" rename constraint "activities_pkey" to "actividades_pkey";
alter table "dominio"."actividades" rename constraint "activities_user_id_fkey" to "actividades_usuario_fk";
alter table "dominio"."actividades" rename constraint "activities_user_id_id_uq" to "actividades_usuario_id_uq";
alter table "dominio"."actividades" rename constraint "activities_subject_owner_fk" to "actividades_materia_propietario_fk";
alter table "dominio"."actividades" rename constraint "activities_time_order_ck" to "actividades_orden_tiempo_ck";
alter table "dominio"."actividades" rename constraint "activities_completed_ck" to "actividades_completada_ck";
alter table "dominio"."actividades" rename constraint "activities_kind_check" to "actividades_tipo_ck";
alter table "dominio"."actividades" rename constraint "activities_title_check" to "actividades_titulo_ck";
alter table "dominio"."actividades" rename constraint "activities_description_check" to "actividades_descripcion_ck";
alter table "dominio"."actividades" rename constraint "activities_status_check" to "actividades_estado_ck";
alter table "dominio"."actividades" rename constraint "activities_priority_check" to "actividades_prioridad_ck";
alter table "dominio"."actividades" rename constraint "activities_estimated_minutes_check" to "actividades_minutos_estimados_ck";
alter table "dominio"."actividades" rename constraint "activities_progress_percent_check" to "actividades_porcentaje_progreso_ck";
alter table "dominio"."actividades" rename constraint "activities_version_check" to "actividades_version_ck";
alter index "dominio"."activities_user_sort_idx" rename to "actividades_usuario_orden_idx";
alter index "dominio"."activities_user_deadline_idx" rename to "actividades_usuario_fecha_limite_idx";
alter index "dominio"."activities_subject_idx" rename to "actividades_materia_idx";

-- Historial de actividades --------------------------------------------------
alter table "dominio"."activity_history" rename to "historial_actividades";
alter table "dominio"."historial_actividades" rename column "user_id" to "usuario_id";
alter table "dominio"."historial_actividades" rename column "activity_id" to "actividad_id";
alter table "dominio"."historial_actividades" rename column "mutation_id" to "mutacion_id";
alter table "dominio"."historial_actividades" rename column "event_type" to "tipo_evento";
alter table "dominio"."historial_actividades" rename column "before_status" to "estado_anterior";
alter table "dominio"."historial_actividades" rename column "after_status" to "estado_posterior";
alter table "dominio"."historial_actividades" rename column "before_progress" to "progreso_anterior";
alter table "dominio"."historial_actividades" rename column "after_progress" to "progreso_posterior";
alter table "dominio"."historial_actividades" rename column "created_at" to "creado_en";
alter table "dominio"."historial_actividades" rename constraint "activity_history_pkey" to "historial_actividades_pkey";
alter table "dominio"."historial_actividades" rename constraint "activity_history_activity_fk" to "historial_actividades_actividad_fk";
alter table "dominio"."historial_actividades" rename constraint "activity_history_mutation_uq" to "historial_actividades_mutacion_uq";
alter table "dominio"."historial_actividades" rename constraint "activity_history_event_type_check" to "historial_actividades_tipo_evento_ck";
alter index "dominio"."activity_history_activity_latest_idx" rename to "historial_actividades_actividad_reciente_idx";

-- Subtareas -----------------------------------------------------------------
alter table "dominio"."subtasks" rename to "subtareas";
alter table "dominio"."subtareas" rename column "sort_order" to "orden";
alter table "dominio"."subtareas" rename column "user_id" to "usuario_id";
alter table "dominio"."subtareas" rename column "activity_id" to "actividad_id";
alter table "dominio"."subtareas" rename column "title" to "titulo";
alter table "dominio"."subtareas" rename column "estimated_minutes" to "minutos_estimados";
alter table "dominio"."subtareas" rename column "is_completed" to "completada";
alter table "dominio"."subtareas" rename column "completed_at" to "completado_en";
alter table "dominio"."subtareas" rename column "archived_at" to "archivado_en";
alter table "dominio"."subtareas" rename column "last_mutation_id" to "ultima_mutacion_id";
alter table "dominio"."subtareas" rename column "created_at" to "creado_en";
alter table "dominio"."subtareas" rename column "updated_at" to "actualizado_en";
alter table "dominio"."subtareas" rename constraint "subtasks_pkey" to "subtareas_pkey";
alter table "dominio"."subtareas" rename constraint "subtasks_activity_owner_fk" to "subtareas_actividad_propietario_fk";
alter table "dominio"."subtareas" rename constraint "subtasks_completion_ck" to "subtareas_completada_ck";
alter table "dominio"."subtareas" rename constraint "subtasks_title_check" to "subtareas_titulo_ck";
alter table "dominio"."subtareas" rename constraint "subtasks_estimated_minutes_check" to "subtareas_minutos_estimados_ck";
alter table "dominio"."subtareas" rename constraint "subtasks_version_check" to "subtareas_version_ck";
alter index "dominio"."subtasks_activity_order_idx" rename to "subtareas_actividad_orden_idx";

-- Eventos de calendario -----------------------------------------------------
alter table "dominio"."calendar_events" rename to "eventos_calendario";
alter table "dominio"."eventos_calendario" rename column "sort_order" to "orden";
alter table "dominio"."eventos_calendario" rename column "user_id" to "usuario_id";
alter table "dominio"."eventos_calendario" rename column "subject_id" to "materia_id";
alter table "dominio"."eventos_calendario" rename column "kind" to "tipo";
alter table "dominio"."eventos_calendario" rename column "title" to "titulo";
alter table "dominio"."eventos_calendario" rename column "description" to "descripcion";
alter table "dominio"."eventos_calendario" rename column "starts_at" to "inicia_en";
alter table "dominio"."eventos_calendario" rename column "ends_at" to "termina_en";
alter table "dominio"."eventos_calendario" rename column "time_zone" to "zona_horaria";
alter table "dominio"."eventos_calendario" rename column "is_locked" to "bloqueado";
alter table "dominio"."eventos_calendario" rename column "source" to "origen";
alter table "dominio"."eventos_calendario" rename column "archived_at" to "archivado_en";
alter table "dominio"."eventos_calendario" rename column "last_mutation_id" to "ultima_mutacion_id";
alter table "dominio"."eventos_calendario" rename column "created_at" to "creado_en";
alter table "dominio"."eventos_calendario" rename column "updated_at" to "actualizado_en";
alter table "dominio"."eventos_calendario" rename constraint "calendar_events_pkey" to "eventos_calendario_pkey";
alter table "dominio"."eventos_calendario" rename constraint "calendar_events_user_id_fkey" to "eventos_calendario_usuario_fk";
alter table "dominio"."eventos_calendario" rename constraint "calendar_events_user_id_id_uq" to "eventos_calendario_usuario_id_uq";
alter table "dominio"."eventos_calendario" rename constraint "calendar_events_subject_owner_fk" to "eventos_calendario_materia_propietario_fk";
alter table "dominio"."eventos_calendario" rename constraint "calendar_events_time_order_ck" to "eventos_calendario_orden_tiempo_ck";
alter table "dominio"."eventos_calendario" rename constraint "calendar_events_kind_check" to "eventos_calendario_tipo_ck";
alter table "dominio"."eventos_calendario" rename constraint "calendar_events_title_check" to "eventos_calendario_titulo_ck";
alter table "dominio"."eventos_calendario" rename constraint "calendar_events_description_check" to "eventos_calendario_descripcion_ck";
alter table "dominio"."eventos_calendario" rename constraint "calendar_events_source_check" to "eventos_calendario_origen_ck";
alter table "dominio"."eventos_calendario" rename constraint "calendar_events_version_check" to "eventos_calendario_version_ck";
alter index "dominio"."calendar_events_user_sort_idx" rename to "eventos_calendario_usuario_orden_idx";
alter index "dominio"."calendar_events_user_start_idx" rename to "eventos_calendario_usuario_inicio_idx";
alter index "dominio"."calendar_events_user_end_idx" rename to "eventos_calendario_usuario_fin_idx";

-- Restricciones not null (PostgreSQL 18 las nombra <tabla>_<columna>_not_null)
do $$
declare
  r record;
begin
  for r in
    select c.oid, s.nspname, t.relname, a.attname, c.conname
    from pg_constraint c
    join pg_namespace s on s.oid = c.connamespace
    join pg_class t on t.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'n' and s.nspname in ('autenticacion', 'dominio')
      and c.conname <> t.relname || '_' || a.attname || '_not_null'
  loop
    execute format('alter table %I.%I rename constraint %I to %I',
      r.nspname, r.relname, r.conname, r.relname || '_' || r.attname || '_not_null');
  end loop;
end $$;

-- Verificación: no debe quedar ningún objeto con nombre en inglés ------------
do $$
declare
  restante text;
begin
  select string_agg(n, ', ') into restante from (
    select conrelid::regclass::text || '.' || conname as n
    from pg_constraint c join pg_namespace s on s.oid = c.connamespace
    where s.nspname in ('autenticacion', 'dominio')
      and conname ~ '(^|_)(user|account|verification|secure_store|subjects|activities|activity_history|subtasks|calendar_events|profiles)(_|$)'
    union all
    select schemaname || '.' || indexname
    from pg_indexes
    where schemaname in ('autenticacion', 'dominio')
      and indexname ~ '(^|_)(user|account|verification|secure_store|subjects|activities|activity_history|subtasks|calendar_events|profiles)(_|$)'
  ) q;
  if restante is not null then
    raise exception 'Quedan objetos con nombre en inglés: %', restante;
  end if;
end $$;
