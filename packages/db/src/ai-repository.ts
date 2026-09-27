import type { Pool } from "pg";

export type AiProviderName = "openai" | "anthropic" | "deepseek";
export type AiUseCaseName =
  | "extract_activity"
  | "estimate_duration"
  | "explain_risk"
  | "explain_replan"
  | "propose_subtasks"
  | "assistant_chat"
  | "onboarding_setup";
export type AiRouteConfig = {
  useCase: AiUseCaseName;
  provider: AiProviderName;
  encryptedKey: Buffer;
  modelId: string;
  timeoutMs: number;
  maxOutputTokens: number;
  dailyBudgetTokens: number;
  inputPriceUsdPerMillion: string | null;
  outputPriceUsdPerMillion: string | null;
};
export type AiConfiguredRoute = AiRouteConfig & { alternate: AiRouteConfig | null };
export type AiAlternateConfig = Omit<
  AiRouteConfig,
  | "useCase"
  | "encryptedKey"
  | "dailyBudgetTokens"
  | "inputPriceUsdPerMillion"
  | "outputPriceUsdPerMillion"
> & { inputPriceUsdPerMillion: string; outputPriceUsdPerMillion: string };
export type AiUsageStatus = "success" | "error" | "invalid" | "timeout";
export type AiFallbackReason =
  | "not_configured"
  | "rate_limited"
  | "budget_exhausted"
  | "invalid_output"
  | "provider_unavailable";

function safeTotal(value: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error("AI usage total is out of range");
  return number;
}

export function createAiRepository(pool: Pool) {
  return {
    async recordFallback(useCase: AiUseCaseName, reason: AiFallbackReason) {
      await pool.query(
        `INSERT INTO dominio.sin_respuesta_ia (id, caso, motivo) VALUES ($1,$2,$3)`,
        [crypto.randomUUID(), useCase, reason],
      );
    },
    async fallbackSummary(from: string, through: string) {
      const result = await pool.query<{
        useCase: AiUseCaseName;
        reason: AiFallbackReason;
        requests: string;
      }>(
        `SELECT caso AS "useCase", motivo AS reason, count(*)::text AS requests
         FROM dominio.sin_respuesta_ia
         WHERE registrado_en >= ($1::date::timestamp AT TIME ZONE 'UTC')
           AND registrado_en < ($2::date::timestamp AT TIME ZONE 'UTC')
         GROUP BY caso, motivo ORDER BY caso, motivo`,
        [from, through],
      );
      return result.rows.map((row) => ({
        useCase: row.useCase,
        reason: row.reason,
        requests: safeTotal(row.requests),
      }));
    },
    async transitionSummary(from: string, through: string) {
      const result = await pool.query<{
        useCase: AiUseCaseName;
        fromProvider: AiProviderName;
        toProvider: AiProviderName;
        reason: "invalid_output" | "provider_unavailable";
        requests: string;
      }>(
        `SELECT caso AS "useCase", proveedor_origen AS "fromProvider",
           proveedor_destino AS "toProvider", motivo AS reason,
           count(*)::text AS requests
         FROM dominio.transiciones_ia
         WHERE registrado_en >= ($1::date::timestamp AT TIME ZONE 'UTC')
           AND registrado_en < ($2::date::timestamp AT TIME ZONE 'UTC')
         GROUP BY caso, proveedor_origen, proveedor_destino, motivo
         ORDER BY caso, proveedor_origen, proveedor_destino, motivo`,
        [from, through],
      );
      return result.rows.map((row) => ({ ...row, requests: safeTotal(row.requests) }));
    },
    async usageSummary(from: string, through: string) {
      const result = await pool.query<{
        useCase: AiUseCaseName;
        provider: AiProviderName;
        status: "reserved" | "unknown" | AiUsageStatus;
        requests: string;
        reservedTokens: string;
        inputTokens: string;
        outputTokens: string;
        knownCostUsd: string;
        totalCostUsd: string | null;
        uncostedRequests: string;
        averageDurationMs: number | null;
        p95DurationMs: number | null;
        unmeasuredRequests: string;
      }>(
        `SELECT caso AS "useCase", proveedor AS provider, estado AS status,
           count(*)::text AS requests,
           sum(tokens_reservados)::text AS "reservedTokens",
           sum(tokens_entrada)::text AS "inputTokens",
           sum(tokens_salida)::text AS "outputTokens",
           coalesce(sum(costo_usd), 0)::numeric(24,9)::text AS "knownCostUsd",
           CASE WHEN count(*) FILTER (WHERE costo_usd IS NULL) = 0
             THEN sum(costo_usd)::numeric(24,9)::text ELSE NULL END AS "totalCostUsd",
           count(*) FILTER (WHERE costo_usd IS NULL)::text AS "uncostedRequests",
           round(avg(duracion_ms))::integer AS "averageDurationMs",
           percentile_disc(0.95) WITHIN GROUP (ORDER BY duracion_ms) AS "p95DurationMs",
           count(*) FILTER (WHERE duracion_ms IS NULL)::text AS "unmeasuredRequests"
         FROM dominio.uso_ia
         WHERE registrado_en >= ($1::date::timestamp AT TIME ZONE 'UTC')
           AND registrado_en < ($2::date::timestamp AT TIME ZONE 'UTC')
         GROUP BY caso, proveedor, estado
         ORDER BY caso, proveedor, estado`,
        [from, through],
      );
      return result.rows.map((row) => ({
        useCase: row.useCase,
        provider: row.provider,
        status: row.status,
        requests: safeTotal(row.requests),
        reservedTokens: safeTotal(row.reservedTokens),
        inputTokens: safeTotal(row.inputTokens),
        outputTokens: safeTotal(row.outputTokens),
        knownCostUsd: row.knownCostUsd,
        totalCostUsd: row.totalCostUsd,
        uncostedRequests: safeTotal(row.uncostedRequests),
        averageDurationMs: row.averageDurationMs,
        p95DurationMs: row.p95DurationMs,
        unmeasuredRequests: safeTotal(row.unmeasuredRequests),
      }));
    },
    /**
     * Sin documento de IA publicado, el uso de IA queda cubierto por los términos
     * y la privacidad que se aceptan al registrarse (la API ya exige esos).
     */
    async hasCurrentConsent(userId: string) {
      const published = await pool.query(
        `SELECT 1 FROM dominio.documentos_privacidad
         WHERE tipo = 'ai' AND publicado_en IS NOT NULL LIMIT 1`,
      );
      if (published.rowCount === 0) return true;
      const result = await pool.query(
        `SELECT 1 FROM dominio.consentimientos c
         JOIN dominio.documentos_privacidad d ON d.id = c.documento_id
         WHERE c.usuario_id = $1 AND d.tipo = 'ai' AND c.decision = 'accepted'
           AND c.id = (
             SELECT latest.id FROM dominio.consentimientos latest
             JOIN dominio.documentos_privacidad ld ON ld.id = latest.documento_id
             WHERE latest.usuario_id = $1 AND ld.tipo = 'ai'
             ORDER BY latest.orden DESC LIMIT 1
           )
           AND NOT EXISTS (
             SELECT 1 FROM dominio.documentos_privacidad newer
             WHERE newer.tipo = 'ai' AND newer.idioma = d.idioma
               AND newer.publicado_en IS NOT NULL AND newer.version > d.version
           ) LIMIT 1`,
        [userId],
      );
      return result.rowCount === 1;
    },
    async route(useCase: AiUseCaseName) {
      const result = await pool.query<
        AiRouteConfig & {
          alternateProvider: AiProviderName | null;
          alternateEncryptedKey: Buffer | null;
          alternateModelId: string | null;
          alternateTimeoutMs: number | null;
          alternateMaxOutputTokens: number | null;
          alternateInputPriceUsdPerMillion: string | null;
          alternateOutputPriceUsdPerMillion: string | null;
        }
      >(
        `SELECT r.caso AS "useCase", p.proveedor AS provider,
           p.clave_cifrada AS "encryptedKey", r.modelo_id AS "modelId",
           r.tiempo_limite_ms AS "timeoutMs", r.maximo_salida_tokens AS "maxOutputTokens",
           r.presupuesto_diario_tokens AS "dailyBudgetTokens",
           r.precio_entrada_usd_millon::text AS "inputPriceUsdPerMillion",
           r.precio_salida_usd_millon::text AS "outputPriceUsdPerMillion",
           pa.proveedor AS "alternateProvider", pa.clave_cifrada AS "alternateEncryptedKey",
           r.modelo_alterno_id AS "alternateModelId",
           r.tiempo_limite_alterno_ms AS "alternateTimeoutMs",
           r.maximo_salida_alterno_tokens AS "alternateMaxOutputTokens",
           r.precio_entrada_alterno_usd_millon::text AS "alternateInputPriceUsdPerMillion",
           r.precio_salida_alterno_usd_millon::text AS "alternateOutputPriceUsdPerMillion"
         FROM dominio.rutas_ia r JOIN dominio.proveedores_ia p ON p.id = r.proveedor_id
         LEFT JOIN dominio.proveedores_ia pa ON pa.id = r.proveedor_alterno_id AND pa.habilitado
         WHERE r.caso = $1 AND r.habilitado AND p.habilitado`,
        [useCase],
      );
      const row = result.rows[0];
      if (!row) return null;
      const alternate =
        row.alternateProvider &&
        row.alternateEncryptedKey &&
        row.alternateModelId &&
        row.alternateTimeoutMs &&
        row.alternateMaxOutputTokens
          ? {
              useCase: row.useCase,
              provider: row.alternateProvider,
              encryptedKey: row.alternateEncryptedKey,
              modelId: row.alternateModelId,
              timeoutMs: row.alternateTimeoutMs,
              maxOutputTokens: row.alternateMaxOutputTokens,
              dailyBudgetTokens: row.dailyBudgetTokens,
              inputPriceUsdPerMillion: row.alternateInputPriceUsdPerMillion,
              outputPriceUsdPerMillion: row.alternateOutputPriceUsdPerMillion,
            }
          : null;
      return {
        useCase: row.useCase,
        provider: row.provider,
        encryptedKey: row.encryptedKey,
        modelId: row.modelId,
        timeoutMs: row.timeoutMs,
        maxOutputTokens: row.maxOutputTokens,
        dailyBudgetTokens: row.dailyBudgetTokens,
        inputPriceUsdPerMillion: row.inputPriceUsdPerMillion,
        outputPriceUsdPerMillion: row.outputPriceUsdPerMillion,
        alternate,
      } satisfies AiConfiguredRoute;
    },
    async adminRoute(useCase: AiUseCaseName) {
      const result = await pool.query<AiRouteConfig>(
        `SELECT r.caso AS "useCase", p.proveedor AS provider,
           p.clave_cifrada AS "encryptedKey", r.modelo_id AS "modelId",
           r.tiempo_limite_ms AS "timeoutMs", r.maximo_salida_tokens AS "maxOutputTokens",
           r.presupuesto_diario_tokens AS "dailyBudgetTokens",
           r.precio_entrada_usd_millon::text AS "inputPriceUsdPerMillion",
           r.precio_salida_usd_millon::text AS "outputPriceUsdPerMillion"
         FROM dominio.rutas_ia r JOIN dominio.proveedores_ia p ON p.id = r.proveedor_id
         WHERE r.caso = $1`,
        [useCase],
      );
      return result.rows[0] ?? null;
    },
    async adminAlternateRoute(useCase: AiUseCaseName) {
      const result = await pool.query<AiRouteConfig>(
        `SELECT r.caso AS "useCase", p.proveedor AS provider,
           p.clave_cifrada AS "encryptedKey", r.modelo_alterno_id AS "modelId",
           r.tiempo_limite_alterno_ms AS "timeoutMs",
           r.maximo_salida_alterno_tokens AS "maxOutputTokens",
           r.presupuesto_diario_tokens AS "dailyBudgetTokens",
           r.precio_entrada_alterno_usd_millon::text AS "inputPriceUsdPerMillion",
           r.precio_salida_alterno_usd_millon::text AS "outputPriceUsdPerMillion"
         FROM dominio.rutas_ia r JOIN dominio.proveedores_ia p ON p.id = r.proveedor_alterno_id
         WHERE r.caso = $1`,
        [useCase],
      );
      return result.rows[0] ?? null;
    },
    async recordTest(actorId: string, provider: AiProviderName) {
      await pool.query(
        `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id)
         SELECT $1,$2,'ai_route.tested',p.id
         FROM dominio.proveedores_ia p WHERE p.proveedor = $3`,
        [crypto.randomUUID(), actorId, provider],
      );
    },
    async reconcileAbandoned(limit = 500) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 500)
        throw new Error("Invalid AI reconciliation batch size");
      const result = await pool.query(
        `WITH stale AS (
           SELECT id FROM dominio.uso_ia
           WHERE estado = 'reserved' AND registrado_en < now() - interval '5 minutes'
           ORDER BY registrado_en, id FOR UPDATE SKIP LOCKED LIMIT $1
         )
         UPDATE dominio.uso_ia usage SET estado = 'unknown'
         FROM stale WHERE usage.id = stale.id`,
        [limit],
      );
      return result.rowCount ?? 0;
    },
    async reserve(
      userId: string,
      route: AiRouteConfig,
      promptVersion: number,
      tokens: number,
      transition?: {
        originUsageId: string;
        originProvider: AiProviderName;
        reason: "invalid_output" | "provider_unavailable";
      },
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `ai-budget:${route.useCase}`,
        ]);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `ai-user-rate:${userId}`,
        ]);
        const total = await client.query<{ used: string }>(
          `SELECT coalesce(sum(tokens_reservados), 0)::text AS used FROM dominio.uso_ia
           WHERE caso = $1 AND registrado_en >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
          [route.useCase],
        );
        const recent = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM dominio.uso_ia
           WHERE usuario_id = $1 AND registrado_en >= now() - interval '1 minute'`,
          [userId],
        );
        if (Number(recent.rows[0]?.count ?? 0) >= 10) {
          await client.query("ROLLBACK");
          return { kind: "rate_limited" as const };
        }
        if (Number(total.rows[0]?.used ?? 0) + tokens > route.dailyBudgetTokens) {
          await client.query("ROLLBACK");
          return { kind: "budget_exhausted" as const };
        }
        const id = crypto.randomUUID();
        await client.query(
          `INSERT INTO dominio.uso_ia
           (id, usuario_id, caso, proveedor, modelo_id, version_instrucciones, estado, tokens_reservados,
            precio_entrada_usd_millon, precio_salida_usd_millon)
           VALUES ($1,$2,$3,$4,$5,$6,'reserved',$7,$8,$9)`,
          [
            id,
            userId,
            route.useCase,
            route.provider,
            route.modelId,
            promptVersion,
            tokens,
            route.inputPriceUsdPerMillion,
            route.outputPriceUsdPerMillion,
          ],
        );
        if (transition) {
          await client.query(
            `INSERT INTO dominio.transiciones_ia
             (id, uso_origen_id, uso_destino_id, caso, proveedor_origen,
              proveedor_destino, motivo)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              crypto.randomUUID(),
              transition.originUsageId,
              id,
              route.useCase,
              transition.originProvider,
              route.provider,
              transition.reason,
            ],
          );
        }
        await client.query("COMMIT");
        return { kind: "reserved" as const, id };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async finish(
      id: string,
      status: AiUsageStatus,
      inputTokens: number,
      outputTokens: number,
      usageReported: boolean,
      durationMs: number,
    ) {
      await pool.query(
        `UPDATE dominio.uso_ia SET estado = $2, tokens_entrada = $3,
           tokens_salida = $4, uso_reportado = $5, duracion_ms = $6,
           costo_usd = CASE WHEN $5::boolean AND precio_entrada_usd_millon IS NOT NULL
             AND precio_salida_usd_millon IS NOT NULL
             THEN round(($3::integer * precio_entrada_usd_millon +
               $4::integer * precio_salida_usd_millon) / 1000000, 9)
             ELSE NULL END
           WHERE id = $1 AND estado IN ('reserved', 'unknown')`,
        [id, status, inputTokens, outputTokens, usageReported, durationMs],
      );
    },
    async listProviders() {
      const result = await pool.query<{
        id: string;
        provider: AiProviderName;
        enabled: boolean;
        updatedAt: Date;
      }>(
        `SELECT id, proveedor AS provider, habilitado AS enabled, actualizado_en AS "updatedAt"
         FROM dominio.proveedores_ia ORDER BY proveedor`,
      );
      return result.rows;
    },
    async upsertProvider(
      actorId: string,
      provider: AiProviderName,
      encryptedKey: Buffer | null,
      enabled: boolean,
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM dominio.proveedores_ia WHERE proveedor = $1 FOR UPDATE",
          [provider],
        );
        const id = existing.rows[0]?.id ?? crypto.randomUUID();
        if (!existing.rowCount && !encryptedKey) {
          await client.query("ROLLBACK");
          return null;
        }
        if (existing.rowCount) {
          await client.query(
            `UPDATE dominio.proveedores_ia SET clave_cifrada = coalesce($2, clave_cifrada),
               habilitado = $3, actualizado_en = now() WHERE id = $1`,
            [id, encryptedKey, enabled],
          );
        } else {
          await client.query(
            `INSERT INTO dominio.proveedores_ia (id, proveedor, clave_cifrada, habilitado)
             VALUES ($1,$2,$3,$4)`,
            [id, provider, encryptedKey, enabled],
          );
        }
        await client.query(
          `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id)
           VALUES ($1,$2,'ai_provider.updated',$3)`,
          [crypto.randomUUID(), actorId, id],
        );
        await client.query("COMMIT");
        return { id, provider, enabled };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async listRoutes() {
      const result = await pool.query<{
        useCase: AiUseCaseName;
        provider: AiProviderName;
        modelId: string;
        timeoutMs: number;
        maxOutputTokens: number;
        dailyBudgetTokens: number;
        inputPriceUsdPerMillion: string | null;
        outputPriceUsdPerMillion: string | null;
        enabled: boolean;
        alternate: AiAlternateConfig | null;
      }>(
        `SELECT r.caso AS "useCase", p.proveedor AS provider, r.modelo_id AS "modelId",
           r.tiempo_limite_ms AS "timeoutMs", r.maximo_salida_tokens AS "maxOutputTokens",
           r.presupuesto_diario_tokens AS "dailyBudgetTokens", r.habilitado AS enabled,
           r.precio_entrada_usd_millon::text AS "inputPriceUsdPerMillion",
           r.precio_salida_usd_millon::text AS "outputPriceUsdPerMillion",
           CASE WHEN pa.id IS NULL THEN NULL ELSE json_build_object(
             'provider', pa.proveedor, 'modelId', r.modelo_alterno_id,
             'timeoutMs', r.tiempo_limite_alterno_ms,
             'maxOutputTokens', r.maximo_salida_alterno_tokens,
             'inputPriceUsdPerMillion', r.precio_entrada_alterno_usd_millon::text,
             'outputPriceUsdPerMillion', r.precio_salida_alterno_usd_millon::text
           ) END AS alternate
         FROM dominio.rutas_ia r JOIN dominio.proveedores_ia p ON p.id = r.proveedor_id
         LEFT JOIN dominio.proveedores_ia pa ON pa.id = r.proveedor_alterno_id
         ORDER BY r.caso`,
      );
      return result.rows;
    },
    async upsertRoute(
      actorId: string,
      route: {
        useCase: AiUseCaseName;
        provider: AiProviderName;
        modelId: string;
        timeoutMs: number;
        maxOutputTokens: number;
        dailyBudgetTokens: number;
        inputPriceUsdPerMillion: string;
        outputPriceUsdPerMillion: string;
        enabled: boolean;
        alternate?: AiAlternateConfig | null;
      },
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const provider = await client.query<{ id: string }>(
          "SELECT id FROM dominio.proveedores_ia WHERE proveedor = $1 FOR UPDATE",
          [route.provider],
        );
        if (!provider.rows[0]) {
          await client.query("ROLLBACK");
          return false;
        }
        const alternate = route.alternate ?? null;
        const alternateProvider = alternate
          ? await client.query<{ id: string }>(
              "SELECT id FROM dominio.proveedores_ia WHERE proveedor = $1 FOR UPDATE",
              [alternate.provider],
            )
          : null;
        if (alternate && !alternateProvider?.rows[0]) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query(
          `INSERT INTO dominio.rutas_ia
           (caso, proveedor_id, modelo_id, tiempo_limite_ms, maximo_salida_tokens,
            presupuesto_diario_tokens, habilitado, precio_entrada_usd_millon,
            precio_salida_usd_millon, proveedor_alterno_id, modelo_alterno_id,
            tiempo_limite_alterno_ms, maximo_salida_alterno_tokens,
            precio_entrada_alterno_usd_millon, precio_salida_alterno_usd_millon)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (caso) DO UPDATE SET proveedor_id = EXCLUDED.proveedor_id,
             modelo_id = EXCLUDED.modelo_id, tiempo_limite_ms = EXCLUDED.tiempo_limite_ms,
             maximo_salida_tokens = EXCLUDED.maximo_salida_tokens,
             presupuesto_diario_tokens = EXCLUDED.presupuesto_diario_tokens,
             habilitado = EXCLUDED.habilitado,
             precio_entrada_usd_millon = EXCLUDED.precio_entrada_usd_millon,
             precio_salida_usd_millon = EXCLUDED.precio_salida_usd_millon,
             proveedor_alterno_id = EXCLUDED.proveedor_alterno_id,
             modelo_alterno_id = EXCLUDED.modelo_alterno_id,
             tiempo_limite_alterno_ms = EXCLUDED.tiempo_limite_alterno_ms,
             maximo_salida_alterno_tokens = EXCLUDED.maximo_salida_alterno_tokens,
             precio_entrada_alterno_usd_millon = EXCLUDED.precio_entrada_alterno_usd_millon,
             precio_salida_alterno_usd_millon = EXCLUDED.precio_salida_alterno_usd_millon,
             actualizado_en = now()`,
          [
            route.useCase,
            provider.rows[0].id,
            route.modelId,
            route.timeoutMs,
            route.maxOutputTokens,
            route.dailyBudgetTokens,
            route.enabled,
            route.inputPriceUsdPerMillion,
            route.outputPriceUsdPerMillion,
            alternateProvider?.rows[0]?.id ?? null,
            alternate?.modelId ?? null,
            alternate?.timeoutMs ?? null,
            alternate?.maxOutputTokens ?? null,
            alternate?.inputPriceUsdPerMillion ?? null,
            alternate?.outputPriceUsdPerMillion ?? null,
          ],
        );
        await client.query(
          `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id)
           VALUES ($1,$2,'ai_route.updated',$3)`,
          [crypto.randomUUID(), actorId, provider.rows[0].id],
        );
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export type AiRepository = ReturnType<typeof createAiRepository>;
