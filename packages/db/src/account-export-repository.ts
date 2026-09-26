import type { Pool } from "pg";

const sections = [
  {
    name: "account",
    sql: `SELECT id, correo AS email, suspendido_en AS "suspendedAt",
    creado_en AS "createdAt"
    FROM autenticacion.usuarios WHERE id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "roles",
    sql: `SELECT rol AS role, version, asignado_en AS "assignedAt",
    actualizado_en AS "updatedAt"
    FROM autenticacion.roles_usuario WHERE usuario_id = $1
    ORDER BY usuario_id LIMIT $2 OFFSET $3`,
  },
  {
    name: "profile",
    sql: `SELECT nombre AS "displayName", idioma AS language,
    zona_horaria AS "timeZone", version, creado_en AS "createdAt", actualizado_en AS "updatedAt"
    FROM dominio.perfiles_usuario WHERE usuario_id = $1 ORDER BY usuario_id LIMIT $2 OFFSET $3`,
  },
  {
    name: "preferences",
    sql: `SELECT sesion_minima AS "minSessionMinutes", sesion_maxima AS "maxSessionMinutes",
    maximo_diario AS "maxDailyMinutes", notificaciones_habilitadas AS "notificationsEnabled",
    push_habilitado AS "pushNotificationsEnabled",
    minuto_silencio_inicio AS "quietStartMinute", minuto_silencio_fin AS "quietEndMinute",
    version, actualizado_en AS "updatedAt" FROM dominio.preferencias_usuario
    WHERE usuario_id = $1 ORDER BY usuario_id LIMIT $2 OFFSET $3`,
  },
  {
    name: "notificationPreferences",
    sql: `SELECT anticipacion_plazo_minutos AS "deadlineLeadMinutes",
    anticipacion_bloque_minutos AS "blockLeadMinutes",
    enfriamiento_riesgo_minutos AS "riskCooldownMinutes",
    version, actualizado_en AS "updatedAt"
    FROM dominio.preferencias_avisos
    WHERE usuario_id = $1 ORDER BY usuario_id LIMIT $2 OFFSET $3`,
  },
  {
    name: "activitySeries",
    sql: `SELECT id, tipo AS kind, titulo AS title,
    descripcion AS description, prioridad AS priority,
    minutos_estimados AS "estimatedMinutes", frecuencia AS frequency,
    inicia_el AS "startOn", hasta_el AS "throughOn",
    zona_horaria AS "timeZone", cantidad_instancias AS "instanceCount",
    creado_en AS "createdAt" FROM dominio.series_actividades
    WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "activities",
    sql: `SELECT id, tipo AS kind,
    titulo AS title, descripcion AS description, estado AS status, prioridad AS priority,
    serie_id AS "seriesId", ocurre_el AS "occursOn",
    inicio_minimo AS "startAfterAt", fecha_limite AS "deadlineAt",
    minutos_estimados AS "estimatedMinutes", porcentaje_progreso AS "progressPercent",
    completado_en AS "completedAt", archivado_en AS "archivedAt",
    eliminado_en AS "deletedAt", version, creado_en AS "createdAt",
    actualizado_en AS "updatedAt" FROM dominio.actividades
    WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "activityHistory",
    sql: `SELECT id, actividad_id AS "activityId",
    tipo_evento AS "eventType", estado_anterior AS "beforeStatus",
    estado_posterior AS "afterStatus", progreso_anterior AS "beforeProgress",
    progreso_posterior AS "afterProgress", creado_en AS "createdAt"
    FROM dominio.historial_actividades WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "subtasks",
    sql: `SELECT id, actividad_id AS "activityId", titulo AS title,
    minutos_estimados AS "estimatedMinutes", completada AS "isCompleted",
    completado_en AS "completedAt", archivado_en AS "archivedAt", version,
    creado_en AS "createdAt", actualizado_en AS "updatedAt" FROM dominio.subtareas
    WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "calendarEvents",
    sql: `SELECT id, tipo AS kind,
    titulo AS title, descripcion AS description, inicia_en AS "startsAt",
    termina_en AS "endsAt", zona_horaria AS "timeZone", bloqueado AS "isLocked",
    archivado_en AS "archivedAt", version, creado_en AS "createdAt",
    actualizado_en AS "updatedAt" FROM dominio.eventos_calendario
    WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "availabilityRules",
    sql: `SELECT id, dia_semana AS weekday,
    minuto_inicio AS "startMinute", minuto_fin AS "endMinute", version,
    archivado_en AS "archivedAt", actualizado_en AS "updatedAt"
    FROM dominio.reglas_disponibilidad WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "availabilityExceptions",
    sql: `SELECT fecha AS date, version,
    actualizado_en AS "updatedAt" FROM dominio.excepciones_disponibilidad
    WHERE usuario_id = $1 ORDER BY fecha LIMIT $2 OFFSET $3`,
  },
  {
    name: "exceptionWindows",
    sql: `SELECT fecha AS date, posicion AS position,
    minuto_inicio AS "startMinute", minuto_fin AS "endMinute"
    FROM dominio.ventanas_excepcion WHERE usuario_id = $1
    ORDER BY fecha, posicion LIMIT $2 OFFSET $3`,
  },
  {
    name: "plans",
    sql: `SELECT id, estado AS status, version,
    version_algoritmo AS "algorithmVersion", revision_origen AS "sourceRevision",
    plan_base_id AS "basePlanId", fecha_desde AS "from", fecha_hasta AS "through",
    sesion_minima AS "minSessionMinutes", sesion_maxima AS "maxSessionMinutes",
    maximo_diario AS "maxDailyMinutes", creado_en AS "createdAt",
    aplicado_en AS "appliedAt" FROM dominio.planes
    WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "planBlocks",
    sql: `SELECT id, plan_id AS "planId", actividad_id AS "activityId",
    inicia_en AS "startsAt", termina_en AS "endsAt", bloqueado AS "isLocked"
    FROM dominio.bloques_plan WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "unscheduledWork",
    sql: `SELECT plan_id AS "planId", actividad_id AS "activityId",
    minutos AS minutes, razon AS reason FROM dominio.trabajo_no_asignado
    WHERE usuario_id = $1 ORDER BY plan_id, actividad_id LIMIT $2 OFFSET $3`,
  },
  {
    name: "planRisks",
    sql: `SELECT plan_id AS "planId", actividad_id AS "activityId",
    minutos_restantes AS "remainingMinutes", minutos_capacidad AS "capacityMinutes",
    minutos_margen AS "marginMinutes", nivel AS level, razones AS reasons
    FROM dominio.riesgos_plan WHERE usuario_id = $1
    ORDER BY plan_id, actividad_id LIMIT $2 OFFSET $3`,
  },
  {
    name: "currentRisks",
    sql: `SELECT plan_id AS "planId", actividad_id AS "activityId",
    revision_origen AS "sourceRevision", version_algoritmo AS "algorithmVersion",
    minutos_restantes AS "remainingMinutes", minutos_capacidad AS "capacityMinutes",
    minutos_margen AS "marginMinutes", nivel AS level, razones AS reasons,
    nivel_cambio_en AS "levelChangedAt", calculado_en AS "computedAt"
    FROM dominio.riesgos_actuales WHERE usuario_id = $1
    ORDER BY plan_id, actividad_id LIMIT $2 OFFSET $3`,
  },
  {
    name: "timeEntries",
    sql: `SELECT id, actividad_id AS "activityId", origen AS source,
    inicia_en AS "startsAt", termina_en AS "endsAt",
    duracion_segundos AS "durationSeconds", version, creado_en AS "createdAt"
    FROM dominio.registros_tiempo WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "notifications",
    sql: `SELECT id, tipo AS type, plan_id AS "planId",
    actividad_id AS "activityId", bloque_id AS "blockId",
    referencia_en AS "referenceAt", leida_en AS "readAt",
    version, creada_en AS "createdAt"
    FROM dominio.notificaciones WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "pushDevices",
    sql: `SELECT id, plataforma AS platform, actualizado_en AS "updatedAt"
    FROM dominio.dispositivos_push WHERE usuario_id = $1
    ORDER BY id LIMIT $2 OFFSET $3`,
  },
  {
    name: "deletionRequest",
    sql: `SELECT estado AS status, motivo_bloqueo AS "blockedReason",
    solicitada_en AS "requestedAt", ejecutar_en AS "executeAt"
    FROM dominio.solicitudes_eliminacion WHERE usuario_id = $1
    ORDER BY usuario_id LIMIT $2 OFFSET $3`,
  },
  {
    name: "consents",
    sql: `SELECT c.id, c.documento_id AS "documentId",
    d.tipo AS type, d.version, d.idioma AS language, c.decision,
    c.registrado_en AS "recordedAt" FROM dominio.consentimientos c
    JOIN dominio.documentos_privacidad d ON d.id = c.documento_id
    WHERE c.usuario_id = $1 ORDER BY c.orden LIMIT $2 OFFSET $3`,
  },
  {
    name: "aiUsage",
    sql: `SELECT id, caso AS "useCase", proveedor AS provider,
    modelo_id AS "modelId", version_prompt AS "promptVersion", estado AS status,
    tokens_reservados AS "reservedTokens",
    tokens_entrada AS "inputTokens", tokens_salida AS "outputTokens",
    duracion_ms AS "durationMs", uso_reportado AS "usageReported",
    costo_usd AS "costUsd",
    registrado_en AS "recordedAt" FROM dominio.uso_ia
    WHERE usuario_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
  },
] as const;

export function createAccountExportRepository(pool: Pool) {
  return {
    async stream(userId: string) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      } catch (error) {
        client.release();
        throw error;
      }
      const encoder = new TextEncoder();
      let started = false;
      let closed = false;
      let section = 0;
      let sectionOpen = false;
      let offset = 0;
      let firstRow = true;
      const release = async () => {
        if (closed) return;
        closed = true;
        await client.query("ROLLBACK").catch(() => {});
        client.release();
      };
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            if (!started) {
              started = true;
              controller.enqueue(
                encoder.encode(
                  `${JSON.stringify({
                    format: "notesia-export-v1",
                    generatedAt: new Date().toISOString(),
                  }).slice(0, -1)},"data":{`,
                ),
              );
              return;
            }
            if (section >= sections.length) {
              controller.enqueue(encoder.encode("}}"));
              controller.close();
              await release();
              return;
            }
            const current = sections[section];
            if (!sectionOpen) {
              controller.enqueue(
                encoder.encode(`${section ? "," : ""}${JSON.stringify(current.name)}:[`),
              );
              sectionOpen = true;
              return;
            }
            const rows = await client.query<Record<string, unknown>>(current.sql, [
              userId,
              50,
              offset,
            ]);
            if (rows.rows.length === 0) {
              controller.enqueue(encoder.encode("]"));
              section++;
              sectionOpen = false;
              offset = 0;
              firstRow = true;
              return;
            }
            const serialized = rows.rows.map((row) => JSON.stringify(row)).join(",");
            controller.enqueue(encoder.encode(`${firstRow ? "" : ","}${serialized}`));
            offset += rows.rows.length;
            firstRow = false;
          } catch (error) {
            await release();
            controller.error(error);
          }
        },
        async cancel() {
          await release();
        },
      });
    },
  };
}

export type AccountExportRepository = ReturnType<typeof createAccountExportRepository>;
