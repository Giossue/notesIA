-- Esquema de referencia inicial para PostgreSQL 16+.
-- Las tablas de autenticación son ilustrativas; al instalar Better Auth,
-- use el esquema oficial generado por la versión fijada y adapte las FK con cuidado.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE estado_usuario AS ENUM ('pending', 'active', 'suspended', 'deleted');
CREATE TYPE rol_app AS ENUM ('student', 'admin');
CREATE TYPE plataforma_dispositivo AS ENUM ('android', 'ios', 'web');
CREATE TYPE tipo_actividad AS ENUM ('academic_task', 'exam', 'personal', 'routine');
CREATE TYPE estado_actividad AS ENUM ('backlog', 'planned', 'in_progress', 'completed', 'cancelled', 'archived');
CREATE TYPE nivel_prioridad AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE origen_registro AS ENUM ('manual', 'natural_language', 'import', 'system');
CREATE TYPE tipo_disponibilidad AS ENUM ('available', 'unavailable');
CREATE TYPE tipo_evento_calendario AS ENUM ('class', 'work', 'appointment', 'personal', 'unavailable', 'other');
CREATE TYPE estado_plan AS ENUM ('draft', 'active', 'superseded', 'rejected', 'expired');
CREATE TYPE motivo_generacion_plan AS ENUM ('manual', 'initial', 'activity_changed', 'availability_changed', 'risk_changed');
CREATE TYPE estado_bloque_plan AS ENUM ('proposed', 'accepted', 'locked', 'in_progress', 'completed', 'skipped', 'cancelled');
CREATE TYPE origen_bloque_plan AS ENUM ('user', 'engine', 'import');
CREATE TYPE origen_registro_tiempo AS ENUM ('timer', 'manual', 'plan_block');
CREATE TYPE nivel_riesgo AS ENUM ('low', 'medium', 'high');
CREATE TYPE proveedor_ia AS ENUM ('openai', 'anthropic', 'deepseek');
CREATE TYPE caso_uso_ia AS ENUM (
  'task_extraction',
  'duration_estimate',
  'risk_explanation',
  'plan_explanation',
  'task_breakdown'
);
CREATE TYPE estado_recomendacion AS ENUM ('pending', 'accepted', 'modified', 'rejected', 'expired');
CREATE TYPE tipo_evento_recomendacion AS ENUM ('created', 'viewed', 'accepted', 'modified', 'rejected', 'expired');
CREATE TYPE tipo_notificacion AS ENUM ('deadline_reminder', 'plan_block_reminder', 'risk_alert', 'plan_changed', 'system');
CREATE TYPE estado_notificacion AS ENUM ('pending', 'processing', 'sent', 'failed', 'cancelled');
CREATE TYPE canal_notificacion AS ENUM ('in_app', 'push', 'email');
CREATE TYPE tipo_documento_privacidad AS ENUM ('terms', 'privacy', 'ai_consent');
CREATE TYPE decision_consentimiento AS ENUM ('accepted', 'revoked');
CREATE TYPE estado_solicitud_eliminacion AS ENUM ('requested', 'confirmed', 'processing', 'completed', 'cancelled');
CREATE TYPE estado_salida AS ENUM ('pending', 'processing', 'processed', 'failed');

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correo citext NOT NULL,
  estado estado_usuario NOT NULL DEFAULT 'pending',
  correo_verificado_en timestamptz,
  ultimo_acceso_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  eliminado_en timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX usuarios_correo_activo_uq
  ON usuarios (correo) WHERE eliminado_en IS NULL;

CREATE TABLE credenciales_autenticacion (
  usuario_id uuid PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  hash_contrasena text NOT NULL,
  contrasena_cambiada_en timestamptz NOT NULL DEFAULT now(),
  intentos_fallidos integer NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sesiones_autenticacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  hash_token text NOT NULL UNIQUE,
  dispositivo_id uuid,
  direccion_ip inet,
  agente_usuario text,
  expira_en timestamptz NOT NULL,
  revocado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  ultima_actividad_en timestamptz NOT NULL DEFAULT now(),
  CHECK (expira_en > creado_en)
);
CREATE INDEX sesiones_autenticacion_activas_idx
  ON sesiones_autenticacion (usuario_id, expira_en) WHERE revocado_en IS NULL;

CREATE TABLE roles_usuario (
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol rol_app NOT NULL,
  otorgado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  otorgado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, rol)
);

CREATE TABLE perfiles_usuario (
  usuario_id uuid PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre varchar(120) NOT NULL,
  nombres varchar(80),
  apellidos varchar(80),
  fecha_nacimiento date,
  url_avatar text,
  idioma varchar(16) NOT NULL DEFAULT 'es-EC',
  zona_horaria varchar(64) NOT NULL DEFAULT 'America/Guayaquil',
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE preferencias_usuario (
  usuario_id uuid PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  semana_inicia_en smallint NOT NULL DEFAULT 1 CHECK (semana_inicia_en BETWEEN 0 AND 6),
  hora_inicio_dia time NOT NULL DEFAULT '07:00',
  hora_fin_dia time NOT NULL DEFAULT '22:00',
  minutos_sesion_defecto integer NOT NULL DEFAULT 50 CHECK (minutos_sesion_defecto BETWEEN 10 AND 240),
  minutos_sesion_min integer NOT NULL DEFAULT 20 CHECK (minutos_sesion_min BETWEEN 5 AND 120),
  minutos_sesion_max integer NOT NULL DEFAULT 120 CHECK (minutos_sesion_max BETWEEN 15 AND 360),
  minutos_descanso integer NOT NULL DEFAULT 10 CHECK (minutos_descanso BETWEEN 0 AND 120),
  minutos_planificados_max_dia integer NOT NULL DEFAULT 480 CHECK (minutos_planificados_max_dia BETWEEN 30 AND 1440),
  dias_horizonte_planificacion integer NOT NULL DEFAULT 14 CHECK (dias_horizonte_planificacion BETWEEN 1 AND 90),
  minutos_recordatorio_defecto integer NOT NULL DEFAULT 30 CHECK (minutos_recordatorio_defecto BETWEEN 0 AND 10080),
  inicio_horas_silencio time,
  fin_horas_silencio time,
  ia_habilitada boolean NOT NULL DEFAULT false,
  analitica_habilitada boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_fin_dia > hora_inicio_dia),
  CHECK (minutos_sesion_max >= minutos_sesion_min)
);

CREATE TABLE dispositivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  plataforma plataforma_dispositivo NOT NULL,
  instalacion_id uuid NOT NULL,
  hash_token_push text,
  token_push_cifrado bytea,
  version_app varchar(32),
  idioma varchar(16),
  zona_horaria varchar(64),
  push_habilitado boolean NOT NULL DEFAULT true,
  ultima_actividad_en timestamptz NOT NULL DEFAULT now(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  revocado_en timestamptz,
  UNIQUE (usuario_id, instalacion_id)
);
CREATE UNIQUE INDEX dispositivos_hash_push_uq
  ON dispositivos (hash_token_push)
  WHERE hash_token_push IS NOT NULL AND revocado_en IS NULL;

ALTER TABLE sesiones_autenticacion
  ADD CONSTRAINT sesiones_autenticacion_dispositivo_fk
  FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id) ON DELETE SET NULL;

CREATE TABLE periodos_academicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre varchar(120) NOT NULL,
  inicia_el date,
  termina_el date,
  actual boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  eliminado_en timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (termina_el IS NULL OR inicia_el IS NULL OR termina_el >= inicia_el)
);
CREATE UNIQUE INDEX periodos_academicos_actual_uq
  ON periodos_academicos (usuario_id)
  WHERE actual = true AND eliminado_en IS NULL;

CREATE TABLE materias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo_academico_id uuid REFERENCES periodos_academicos(id) ON DELETE SET NULL,
  nombre varchar(160) NOT NULL,
  color varchar(40),
  nombre_docente varchar(160),
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  eliminado_en timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX materias_usuario_periodo_idx
  ON materias (usuario_id, periodo_academico_id) WHERE eliminado_en IS NULL;
-- normalizar_nombre: minúsculas, sin tildes (unaccent) y espacios simples.
CREATE UNIQUE INDEX materias_usuario_nombre_activo_uq
  ON materias (usuario_id, normalizar_nombre(nombre))
  WHERE archivado_en IS NULL AND eliminado_en IS NULL;

CREATE TABLE eventos_calendario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  materia_id uuid REFERENCES materias(id) ON DELETE SET NULL,
  tipo tipo_evento_calendario NOT NULL DEFAULT 'other',
  titulo varchar(200) NOT NULL,
  descripcion text,
  inicia_en timestamptz NOT NULL,
  termina_en timestamptz NOT NULL,
  zona_horaria varchar(64) NOT NULL,
  regla_recurrencia text,
  recurrencia_hasta timestamptz,
  bloqueado boolean NOT NULL DEFAULT true,
  origen origen_registro NOT NULL DEFAULT 'manual',
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  eliminado_en timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (termina_en > inicia_en)
);
CREATE INDEX eventos_calendario_usuario_tiempo_idx
  ON eventos_calendario (usuario_id, inicia_en, termina_en)
  WHERE eliminado_en IS NULL;

CREATE TABLE actividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  materia_id uuid REFERENCES materias(id) ON DELETE SET NULL,
  recurrencia_padre_id uuid REFERENCES actividades(id) ON DELETE SET NULL,
  tipo tipo_actividad NOT NULL,
  titulo varchar(240) NOT NULL,
  descripcion text,
  estado estado_actividad NOT NULL DEFAULT 'backlog',
  prioridad nivel_prioridad NOT NULL DEFAULT 'medium',
  inicio_minimo timestamptz,
  fecha_limite timestamptz,
  minutos_estimados integer CHECK (minutos_estimados IS NULL OR minutos_estimados > 0),
  porcentaje_progreso smallint NOT NULL DEFAULT 0 CHECK (porcentaje_progreso BETWEEN 0 AND 100),
  regla_recurrencia text,
  zona_horaria_recurrencia varchar(64),
  recurrencia_hasta timestamptz,
  origen origen_registro NOT NULL DEFAULT 'manual',
  completado_en timestamptz,
  cancelado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  eliminado_en timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (fecha_limite IS NULL OR inicio_minimo IS NULL OR fecha_limite >= inicio_minimo),
  CHECK (estado <> 'completed' OR (porcentaje_progreso = 100 AND completado_en IS NOT NULL))
);
CREATE INDEX actividades_usuario_estado_fecha_limite_idx
  ON actividades (usuario_id, estado, fecha_limite)
  WHERE eliminado_en IS NULL;
CREATE INDEX actividades_materia_idx
  ON actividades (materia_id, fecha_limite)
  WHERE eliminado_en IS NULL;
CREATE INDEX actividades_sincronizacion_idx
  ON actividades (usuario_id, actualizado_en);

CREATE TABLE subtareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id uuid NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  titulo varchar(240) NOT NULL,
  completada boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  minutos_estimados integer CHECK (minutos_estimados IS NULL OR minutos_estimados > 0),
  completado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (completada = false AND completado_en IS NULL)
    OR
    (completada = true AND completado_en IS NOT NULL)
  )
);
CREATE INDEX subtareas_orden_idx
  ON subtareas (actividad_id, orden, creado_en);

CREATE TABLE historial_actividades (
  id bigserial PRIMARY KEY,
  actividad_id uuid NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  actor_usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo_evento varchar(80) NOT NULL,
  datos_anteriores jsonb,
  datos_posteriores jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX historial_actividades_reciente_idx
  ON historial_actividades (actividad_id, creado_en DESC);

CREATE TABLE reglas_disponibilidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo tipo_disponibilidad NOT NULL DEFAULT 'available',
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  inicia_en_local time NOT NULL,
  termina_en_local time NOT NULL,
  zona_horaria varchar(64) NOT NULL,
  vigente_desde date,
  vigente_hasta date,
  etiqueta varchar(120),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  eliminado_en timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (termina_en_local > inicia_en_local),
  CHECK (vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta >= vigente_desde)
);
CREATE INDEX reglas_disponibilidad_usuario_dia_semana_idx
  ON reglas_disponibilidad (usuario_id, dia_semana)
  WHERE eliminado_en IS NULL;

CREATE TABLE excepciones_disponibilidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo tipo_disponibilidad NOT NULL,
  inicia_en timestamptz NOT NULL,
  termina_en timestamptz NOT NULL,
  motivo varchar(240),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  eliminado_en timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (termina_en > inicia_en)
);
CREATE INDEX excepciones_disponibilidad_usuario_tiempo_idx
  ON excepciones_disponibilidad (usuario_id, inicia_en, termina_en)
  WHERE eliminado_en IS NULL;

CREATE TABLE planes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  estado estado_plan NOT NULL DEFAULT 'draft',
  motivo_generacion motivo_generacion_plan NOT NULL DEFAULT 'manual',
  inicio_horizonte timestamptz NOT NULL,
  fin_horizonte timestamptz NOT NULL,
  version_algoritmo varchar(40) NOT NULL,
  numero_plan integer NOT NULL CHECK (numero_plan > 0),
  plan_base_id uuid REFERENCES planes(id) ON DELETE SET NULL,
  version_datos_base bigint,
  resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  aplicado_en timestamptz,
  expira_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (fin_horizonte > inicio_horizonte),
  CHECK (estado <> 'active' OR aplicado_en IS NOT NULL)
);
CREATE UNIQUE INDEX planes_usuario_numero_uq
  ON planes (usuario_id, numero_plan);
CREATE UNIQUE INDEX planes_usuario_activo_uq
  ON planes (usuario_id) WHERE estado = 'active';
CREATE INDEX planes_usuario_creado_idx
  ON planes (usuario_id, creado_en DESC);

CREATE TABLE bloques_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES planes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  actividad_id uuid REFERENCES actividades(id) ON DELETE SET NULL,
  titulo_instantanea varchar(240) NOT NULL,
  inicia_en timestamptz NOT NULL,
  termina_en timestamptz NOT NULL,
  estado estado_bloque_plan NOT NULL DEFAULT 'proposed',
  origen origen_bloque_plan NOT NULL DEFAULT 'engine',
  bloqueado boolean NOT NULL DEFAULT false,
  efectivo boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (termina_en > inicia_en),
  CHECK (NOT bloqueado OR estado IN ('accepted', 'locked', 'in_progress', 'completed'))
);
CREATE INDEX bloques_plan_plan_tiempo_idx
  ON bloques_plan (plan_id, inicia_en);
CREATE INDEX bloques_plan_usuario_tiempo_idx
  ON bloques_plan (usuario_id, inicia_en, termina_en);
ALTER TABLE bloques_plan
  ADD CONSTRAINT bloques_plan_efectivos_sin_solapamiento_ex
  EXCLUDE USING gist (
    usuario_id WITH =,
    tstzrange(inicia_en, termina_en, '[)') WITH &&
  )
  WHERE (
    efectivo = true
    AND estado IN ('accepted', 'locked', 'in_progress')
  );

CREATE TABLE registros_tiempo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  actividad_id uuid NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  bloque_plan_id uuid REFERENCES bloques_plan(id) ON DELETE SET NULL,
  origen origen_registro_tiempo NOT NULL DEFAULT 'manual',
  iniciado_en timestamptz NOT NULL,
  finalizado_en timestamptz,
  duracion_segundos integer CHECK (duracion_segundos IS NULL OR duracion_segundos >= 0),
  nota varchar(500),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (finalizado_en IS NULL OR finalizado_en >= iniciado_en),
  CHECK ((finalizado_en IS NULL AND duracion_segundos IS NULL) OR finalizado_en IS NOT NULL)
);
CREATE UNIQUE INDEX registros_tiempo_uno_abierto_uq
  ON registros_tiempo (usuario_id) WHERE finalizado_en IS NULL;
CREATE INDEX registros_tiempo_actividad_idx
  ON registros_tiempo (actividad_id, iniciado_en DESC);
CREATE INDEX registros_tiempo_usuario_idx
  ON registros_tiempo (usuario_id, iniciado_en DESC);

CREATE TABLE evaluaciones_riesgo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  actividad_id uuid NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES planes(id) ON DELETE SET NULL,
  nivel nivel_riesgo NOT NULL,
  minutos_restantes integer NOT NULL CHECK (minutos_restantes >= 0),
  minutos_disponibles integer NOT NULL CHECK (minutos_disponibles >= 0),
  minutos_margen integer NOT NULL,
  motivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  version_algoritmo varchar(40) NOT NULL,
  evaluado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evaluaciones_riesgo_actividad_reciente_idx
  ON evaluaciones_riesgo (actividad_id, evaluado_en DESC);
CREATE INDEX evaluaciones_riesgo_usuario_nivel_idx
  ON evaluaciones_riesgo (usuario_id, nivel, evaluado_en DESC);

CREATE TABLE configuraciones_proveedor_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor proveedor_ia NOT NULL,
  nombre varchar(120) NOT NULL,
  url_base text,
  ref_secreto_credencial text NOT NULL,
  modelos_permitidos jsonb NOT NULL DEFAULT '[]'::jsonb,
  habilitado boolean NOT NULL DEFAULT false,
  creado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ultima_prueba_en timestamptz,
  estado_ultima_prueba varchar(40),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proveedor, nombre)
);

CREATE TABLE rutas_caso_uso_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_uso caso_uso_ia NOT NULL UNIQUE,
  configuracion_proveedor_id uuid NOT NULL REFERENCES configuraciones_proveedor_ia(id) ON DELETE RESTRICT,
  modelo_id varchar(160) NOT NULL,
  configuracion_proveedor_respaldo_id uuid REFERENCES configuraciones_proveedor_ia(id) ON DELETE SET NULL,
  modelo_respaldo_id varchar(160),
  temperatura numeric(3,2) NOT NULL DEFAULT 0.20 CHECK (temperatura BETWEEN 0 AND 2),
  tokens_salida_max integer NOT NULL DEFAULT 800 CHECK (tokens_salida_max BETWEEN 32 AND 32768),
  tiempo_espera_ms integer NOT NULL DEFAULT 15000 CHECK (tiempo_espera_ms BETWEEN 1000 AND 120000),
  presupuesto_diario_micros bigint CHECK (presupuesto_diario_micros IS NULL OR presupuesto_diario_micros >= 0),
  version_prompt varchar(60) NOT NULL,
  habilitado boolean NOT NULL DEFAULT false,
  actualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (configuracion_proveedor_respaldo_id IS NULL AND modelo_respaldo_id IS NULL)
    OR
    (configuracion_proveedor_respaldo_id IS NOT NULL AND modelo_respaldo_id IS NOT NULL)
  )
);

CREATE TABLE recomendaciones_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  actividad_id uuid REFERENCES actividades(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES planes(id) ON DELETE CASCADE,
  caso_uso caso_uso_ia NOT NULL,
  estado estado_recomendacion NOT NULL DEFAULT 'pending',
  configuracion_proveedor_id uuid REFERENCES configuraciones_proveedor_ia(id) ON DELETE SET NULL,
  modelo_id varchar(160),
  version_prompt varchar(60) NOT NULL,
  hash_entrada char(64) NOT NULL,
  carga_estructurada jsonb NOT NULL,
  explicacion text,
  confianza numeric(4,3) CHECK (confianza IS NULL OR confianza BETWEEN 0 AND 1),
  expira_en timestamptz,
  decidido_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (
    actividad_id IS NOT NULL
    OR plan_id IS NOT NULL
    OR caso_uso = 'task_extraction'
  )
);
CREATE INDEX recomendaciones_ia_pendientes_idx
  ON recomendaciones_ia (usuario_id, creado_en DESC)
  WHERE estado = 'pending';

CREATE TABLE eventos_recomendacion_ia (
  id bigserial PRIMARY KEY,
  recomendacion_id uuid NOT NULL REFERENCES recomendaciones_ia(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_evento tipo_evento_recomendacion NOT NULL,
  modificacion jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eventos_recomendacion_ia_idx
  ON eventos_recomendacion_ia (recomendacion_id, creado_en);

CREATE TABLE registros_uso_ia (
  id bigserial PRIMARY KEY,
  solicitud_id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  proveedor proveedor_ia NOT NULL,
  modelo_id varchar(160) NOT NULL,
  caso_uso caso_uso_ia NOT NULL,
  version_prompt varchar(60) NOT NULL,
  tokens_entrada integer CHECK (tokens_entrada IS NULL OR tokens_entrada >= 0),
  tokens_salida integer CHECK (tokens_salida IS NULL OR tokens_salida >= 0),
  costo_micros bigint CHECK (costo_micros IS NULL OR costo_micros >= 0),
  latencia_ms integer CHECK (latencia_ms IS NULL OR latencia_ms >= 0),
  exitoso boolean NOT NULL,
  codigo_error varchar(80),
  uso_respaldo boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registros_uso_ia_creado_idx
  ON registros_uso_ia (creado_en DESC);
CREATE INDEX registros_uso_ia_usuario_creado_idx
  ON registros_uso_ia (usuario_id, creado_en DESC);

CREATE TABLE preferencias_notificacion (
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo tipo_notificacion NOT NULL,
  habilitado boolean NOT NULL DEFAULT true,
  canales canal_notificacion[] NOT NULL
    DEFAULT ARRAY['in_app','push']::canal_notificacion[],
  minutos_anticipacion integer CHECK (minutos_anticipacion IS NULL OR minutos_anticipacion BETWEEN 0 AND 10080),
  minutos_enfriamiento integer NOT NULL DEFAULT 120 CHECK (minutos_enfriamiento BETWEEN 0 AND 10080),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, tipo)
);

CREATE TABLE notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo tipo_notificacion NOT NULL,
  estado estado_notificacion NOT NULL DEFAULT 'pending',
  canales canal_notificacion[] NOT NULL,
  titulo varchar(200) NOT NULL,
  cuerpo varchar(1000) NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  clave_deduplicacion varchar(200),
  programado_en timestamptz NOT NULL,
  procesamiento_iniciado_en timestamptz,
  enviado_en timestamptz,
  leido_en timestamptz,
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  ultimo_codigo_error varchar(80),
  mensaje_proveedor_id varchar(200),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notificaciones_despacho_idx
  ON notificaciones (estado, programado_en)
  WHERE estado IN ('pending', 'failed');
CREATE INDEX notificaciones_usuario_creado_idx
  ON notificaciones (usuario_id, creado_en DESC);
CREATE UNIQUE INDEX notificaciones_deduplicacion_uq
  ON notificaciones (usuario_id, clave_deduplicacion)
  WHERE clave_deduplicacion IS NOT NULL;

CREATE TABLE documentos_privacidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_documento_privacidad NOT NULL,
  version varchar(40) NOT NULL,
  idioma varchar(16) NOT NULL DEFAULT 'es-EC',
  hash_contenido char(64) NOT NULL,
  url_publica text NOT NULL,
  publicado_en timestamptz NOT NULL,
  retirado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, version, idioma)
);

CREATE TABLE registros_consentimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  documento_id uuid NOT NULL REFERENCES documentos_privacidad(id) ON DELETE RESTRICT,
  decision decision_consentimiento NOT NULL,
  origen varchar(40) NOT NULL DEFAULT 'mobile',
  hash_ip char(64),
  hash_agente_usuario char(64),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registros_consentimiento_usuario_idx
  ON registros_consentimiento (usuario_id, creado_en DESC);

CREATE TABLE solicitudes_eliminacion_cuenta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  estado estado_solicitud_eliminacion NOT NULL DEFAULT 'requested',
  solicitado_en timestamptz NOT NULL DEFAULT now(),
  confirmado_en timestamptz,
  programado_para timestamptz,
  completado_en timestamptz,
  motivo_cancelacion text,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX solicitudes_eliminacion_cuenta_abierta_uq
  ON solicitudes_eliminacion_cuenta (usuario_id)
  WHERE estado IN ('requested', 'confirmed', 'processing');

CREATE TABLE registros_auditoria (
  id bigserial PRIMARY KEY,
  actor_usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  objetivo_usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  accion varchar(120) NOT NULL,
  tipo_recurso varchar(80) NOT NULL,
  recurso_id varchar(120),
  solicitud_id uuid,
  direccion_ip inet,
  metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registros_auditoria_actor_idx
  ON registros_auditoria (actor_usuario_id, creado_en DESC);
CREATE INDEX registros_auditoria_recurso_idx
  ON registros_auditoria (tipo_recurso, recurso_id, creado_en DESC);

CREATE TABLE claves_idempotencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  clave varchar(160) NOT NULL,
  ruta varchar(200) NOT NULL,
  hash_solicitud char(64) NOT NULL,
  estado_respuesta integer,
  cuerpo_respuesta jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  expira_en timestamptz NOT NULL,
  UNIQUE (usuario_id, clave, ruta),
  CHECK (expira_en > creado_en)
);
CREATE INDEX claves_idempotencia_expiracion_idx
  ON claves_idempotencia (expira_en);

CREATE TABLE eventos_salida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_agregado varchar(80) NOT NULL,
  agregado_id uuid,
  tipo_evento varchar(120) NOT NULL,
  carga jsonb NOT NULL,
  estado estado_salida NOT NULL DEFAULT 'pending',
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  disponible_en timestamptz NOT NULL DEFAULT now(),
  bloqueado_en timestamptz,
  bloqueado_por varchar(120),
  procesado_en timestamptz,
  ultimo_codigo_error varchar(80),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eventos_salida_reclamo_idx
  ON eventos_salida (estado, disponible_en, creado_en)
  WHERE estado IN ('pending', 'failed');

CREATE TABLE configuracion_sistema (
  clave varchar(120) PRIMARY KEY,
  valor jsonb NOT NULL,
  publico boolean NOT NULL DEFAULT false,
  actualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION establecer_actualizado_en_y_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en = now();
  IF TG_ARGV[0] = 'versioned' THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER usuarios_actualizado_trg
BEFORE UPDATE ON usuarios
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('versioned');

CREATE TRIGGER credenciales_autenticacion_actualizado_trg
BEFORE UPDATE ON credenciales_autenticacion
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('plain');

CREATE TRIGGER perfiles_usuario_actualizado_trg
BEFORE UPDATE ON perfiles_usuario
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('plain');

CREATE TRIGGER preferencias_usuario_actualizado_trg
BEFORE UPDATE ON preferencias_usuario
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('plain');

CREATE TRIGGER dispositivos_actualizado_trg
BEFORE UPDATE ON dispositivos
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('plain');

CREATE TRIGGER periodos_academicos_actualizado_trg
BEFORE UPDATE ON periodos_academicos
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('versioned');

CREATE TRIGGER materias_actualizado_trg
BEFORE UPDATE ON materias
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('versioned');

CREATE TRIGGER eventos_calendario_actualizado_trg
BEFORE UPDATE ON eventos_calendario
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('versioned');

CREATE TRIGGER actividades_actualizado_trg
BEFORE UPDATE ON actividades
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('versioned');

CREATE TRIGGER subtareas_actualizado_trg
BEFORE UPDATE ON subtareas
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('plain');

CREATE TRIGGER reglas_disponibilidad_actualizado_trg
BEFORE UPDATE ON reglas_disponibilidad
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('versioned');

CREATE TRIGGER excepciones_disponibilidad_actualizado_trg
BEFORE UPDATE ON excepciones_disponibilidad
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('versioned');

CREATE TRIGGER planes_actualizado_trg
BEFORE UPDATE ON planes
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('plain');

CREATE TRIGGER bloques_plan_actualizado_trg
BEFORE UPDATE ON bloques_plan
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('versioned');

CREATE TRIGGER registros_tiempo_actualizado_trg
BEFORE UPDATE ON registros_tiempo
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('versioned');

CREATE TRIGGER configuraciones_proveedor_ia_actualizado_trg
BEFORE UPDATE ON configuraciones_proveedor_ia
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('plain');

CREATE TRIGGER rutas_caso_uso_ia_actualizado_trg
BEFORE UPDATE ON rutas_caso_uso_ia
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('plain');

CREATE TRIGGER notificaciones_actualizado_trg
BEFORE UPDATE ON notificaciones
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('plain');

CREATE TRIGGER solicitudes_eliminacion_cuenta_actualizado_trg
BEFORE UPDATE ON solicitudes_eliminacion_cuenta
FOR EACH ROW EXECUTE FUNCTION establecer_actualizado_en_y_version('plain');

COMMIT;
