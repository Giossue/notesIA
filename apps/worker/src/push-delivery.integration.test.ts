import { afterAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  createPushDeliveryRepository,
  createPushDeviceRepository,
  createPushTokenCipher,
} from "@notesia/db";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for push integration tests");
const target = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Push integration tests only run against local notesia_dev");

const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const devices = createPushDeviceRepository(pool);
const cipher = createPushTokenCipher(randomBytes(32).toString("base64"));
const deliveries = createPushDeliveryRepository(pool, cipher);
const users: string[] = [];
const daytime = new Date("2026-10-05T12:00:00.000Z");

afterAll(async () => {
  for (const userId of users) {
    await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [userId]);
  }
  await pool.end();
});

async function queueDelivery(token: string) {
  const userId = crypto.randomUUID();
  users.push(userId);
  const deviceId = crypto.randomUUID();
  const planId = crypto.randomUUID();
  const notificationId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba push', $2, false)`,
    [userId, `push-${userId}@example.test`],
  );
  await pool.query(
    "UPDATE dominio.perfiles_usuario SET zona_horaria = 'Etc/UTC' WHERE usuario_id = $1",
    [userId],
  );
  await pool.query(
    "UPDATE dominio.preferencias_usuario SET push_habilitado = true WHERE usuario_id = $1",
    [userId],
  );
  const revision = await pool.query<{ value: string }>(
    `SELECT revision::text AS value FROM dominio.revisiones_planificacion WHERE usuario_id = $1`,
    [userId],
  );
  await pool.query(
    `INSERT INTO dominio.planes
       (id, usuario_id, estado, version_algoritmo, revision_origen,
        fecha_desde, fecha_hasta, sesion_minima, sesion_maxima, maximo_diario)
     VALUES ($1,$2,'active','deterministic-v2',$3,'2026-10-05','2026-10-06',25,90,240)`,
    [planId, userId, revision.rows[0]?.value],
  );
  const outbox = await pool.query<{ id: string }>(
    `INSERT INTO dominio.bandeja_salida (usuario_id, tipo_evento, plan_id)
     VALUES ($1,'plan.applied',$2) RETURNING id::text`,
    [userId, planId],
  );
  await pool.query(
    `INSERT INTO dominio.notificaciones (id, usuario_id, evento_salida_id, tipo, plan_id)
     VALUES ($1,$2,$3,'plan_applied',$4)`,
    [notificationId, userId, outbox.rows[0]?.id, planId],
  );
  expect(
    await devices.upsert(userId, deviceId, "android", cipher.encrypt(userId, deviceId, token)),
  ).toEqual({
    kind: "saved",
  });
  await pool.query(
    `INSERT INTO dominio.envios_push (id, usuario_id, dispositivo_id, notificacion_id)
     VALUES ($1,$2,$3,$4)`,
    [jobId, userId, deviceId, notificationId],
  );
  return { userId, deviceId, jobId };
}

test("stale unregistered response preserves a refreshed device and retries its job", async () => {
  const { userId, deviceId, jobId } = await queueDelivery("old-token");
  expect(
    await deliveries.processOne(async (token) => {
      expect(token).toBe("old-token");
      expect(
        await devices.upsert(
          userId,
          deviceId,
          "android",
          cipher.encrypt(userId, deviceId, "new-token"),
        ),
      ).toEqual({ kind: "saved" });
      return "unregistered";
    }, daytime),
  ).toEqual({ kind: "retry_scheduled" });
  expect((await devices.list(userId)).map((device) => device.id)).toContain(deviceId);
  const seen: string[] = [];
  expect(
    await deliveries.processOne(async (token) => {
      seen.push(token);
      return "sent";
    }, daytime),
  ).toEqual({ kind: "sent" });
  expect(seen).toEqual(["new-token"]);
  const job = await pool.query<{ status: string }>(
    `SELECT estado AS status FROM dominio.envios_push WHERE id = $1 AND usuario_id = $2`,
    [jobId, userId],
  );
  expect(job.rows[0]?.status).toBe("done");
});

test("unregistered response removes a device whose token did not change", async () => {
  const { userId, deviceId, jobId } = await queueDelivery("retired-token");
  expect(
    await deliveries.processOne(async (token) => {
      expect(token).toBe("retired-token");
      return "unregistered";
    }, daytime),
  ).toEqual({ kind: "invalidated" });
  expect((await devices.list(userId)).map((device) => device.id)).not.toContain(deviceId);
  const job = await pool.query("SELECT id FROM dominio.envios_push WHERE id = $1", [jobId]);
  expect(job.rowCount).toBe(0);
});

test("push opt-out committed after claim suppresses delivery", async () => {
  const { userId, jobId } = await queueDelivery("opt-out-token");
  let switched = false;
  const interleavedPool = {
    query: async (statement: string, values?: unknown[]) => {
      const result = await pool.query(statement, values);
      if (!switched && statement.includes("WITH picked AS") && result.rows[0]?.userId === userId) {
        switched = true;
        await pool.query(
          "UPDATE dominio.preferencias_usuario SET push_habilitado = false WHERE usuario_id = $1",
          [userId],
        );
      }
      return result;
    },
  } as unknown as Pool;
  let sends = 0;
  expect(
    await createPushDeliveryRepository(interleavedPool, cipher).processOne(async () => {
      sends++;
      return "sent";
    }, daytime),
  ).toEqual({ kind: "suppressed" });
  expect(switched).toBe(true);
  expect(sends).toBe(0);
  const job = await pool.query<{ status: string }>(
    `SELECT estado AS status FROM dominio.envios_push WHERE id = $1 AND usuario_id = $2`,
    [jobId, userId],
  );
  expect(job.rows[0]?.status).toBe("done");
});

test("token refreshed after claim is used for delivery", async () => {
  const { userId, deviceId } = await queueDelivery("old-claim-token");
  let switched = false;
  const interleavedPool = {
    query: async (statement: string, values?: unknown[]) => {
      const result = await pool.query(statement, values);
      if (!switched && statement.includes("WITH picked AS") && result.rows[0]?.userId === userId) {
        switched = true;
        await devices.upsert(
          userId,
          deviceId,
          "android",
          cipher.encrypt(userId, deviceId, "current-token"),
        );
      }
      return result;
    },
  } as unknown as Pool;
  const tokens: string[] = [];
  expect(
    await createPushDeliveryRepository(interleavedPool, cipher).processOne(async (token) => {
      tokens.push(token);
      return "sent";
    }, daytime),
  ).toEqual({ kind: "sent" });
  expect(switched).toBe(true);
  expect(tokens).toEqual(["current-token"]);
});
