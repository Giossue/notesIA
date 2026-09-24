import type { Pool } from "pg";
import { isQuietAt } from "./notification-scheduler-repository";
import type { PushTokenCipher } from "./push-crypto";

type DeliveryClaim = {
  id: string;
  userId: string;
  deviceId: string;
  notificationId: string;
  notificationType: string;
  attempts: number;
};
type DeliveryState = {
  encryptedToken: Buffer;
  timeZone: string;
  quietStartMinute: number;
  quietEndMinute: number;
  notificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
};
export type PushSender = (
  token: string,
  notificationId: string,
  type: string,
) => Promise<"sent" | "unregistered">;

export function createPushDeliveryRepository(pool: Pool, cipher: PushTokenCipher) {
  return {
    async processOne(sender: PushSender, now: Date = new Date()) {
      const claimed = await pool.query<DeliveryClaim>(
        `WITH picked AS (
           SELECT id FROM dominio.envios_push
           WHERE (estado = 'pending' AND disponible_en <= now())
              OR (estado = 'sending' AND arrendado_hasta < now())
           ORDER BY disponible_en, id FOR UPDATE SKIP LOCKED LIMIT 1
         ), claimed AS (
           UPDATE dominio.envios_push job SET estado = 'sending',
             intentos = intentos + 1, arrendado_hasta = now() + interval '5 minutes'
           FROM picked WHERE job.id = picked.id RETURNING job.*
         )
         SELECT c.id, c.usuario_id AS "userId", c.dispositivo_id AS "deviceId",
           c.notificacion_id AS "notificationId", n.tipo AS "notificationType",
           c.intentos AS attempts
         FROM claimed c
         JOIN dominio.notificaciones n ON n.usuario_id = c.usuario_id AND n.id = c.notificacion_id`,
      );
      const row = claimed.rows[0];
      if (!row) return { kind: "empty" as const };
      const current = await pool.query<DeliveryState>(
        `SELECT d.token_cifrado AS "encryptedToken",
           profile.zona_horaria AS "timeZone",
           prefs.minuto_silencio_inicio AS "quietStartMinute",
           prefs.minuto_silencio_fin AS "quietEndMinute",
           prefs.notificaciones_habilitadas AS "notificationsEnabled",
           prefs.push_habilitado AS "pushNotificationsEnabled"
         FROM dominio.envios_push job
         JOIN dominio.dispositivos_push d ON d.usuario_id = job.usuario_id
           AND d.id = job.dispositivo_id
         JOIN dominio.perfiles_usuario profile ON profile.usuario_id = job.usuario_id
         JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = job.usuario_id
         WHERE job.id = $1 AND job.usuario_id = $2 AND job.intentos = $3
           AND job.dispositivo_id = $4 AND job.estado = 'sending'`,
        [row.id, row.userId, row.attempts, row.deviceId],
      );
      const state = current.rows[0];
      if (!state) return { kind: "empty" as const };
      if (!state.notificationsEnabled || !state.pushNotificationsEnabled) {
        await pool.query(
          `UPDATE dominio.envios_push SET estado = 'done', arrendado_hasta = NULL
           WHERE id = $1 AND estado = 'sending' AND intentos = $2`,
          [row.id, row.attempts],
        );
        return { kind: "suppressed" as const };
      }
      try {
        if (isQuietAt(now, state.timeZone, state.quietStartMinute, state.quietEndMinute)) {
          await pool.query(
            `UPDATE dominio.envios_push SET estado = 'pending',
               intentos = greatest(0, intentos - 1), arrendado_hasta = NULL,
               disponible_en = now() + interval '15 minutes'
             WHERE id = $1 AND estado = 'sending' AND intentos = $2`,
            [row.id, row.attempts],
          );
          return { kind: "deferred" as const };
        }
        const token = cipher.decrypt(row.userId, row.deviceId, state.encryptedToken);
        const sent = await sender(token, row.notificationId, row.notificationType);
        if (sent === "unregistered") {
          const removed = await pool.query(
            `DELETE FROM dominio.dispositivos_push
             WHERE usuario_id = $1 AND id = $2 AND token_cifrado = $3`,
            [row.userId, row.deviceId, state.encryptedToken],
          );
          if (removed.rowCount === 1) return { kind: "invalidated" as const };
          await pool.query(
            `UPDATE dominio.envios_push SET estado = 'pending',
               intentos = greatest(0, intentos - 1), arrendado_hasta = NULL,
               disponible_en = now()
             WHERE id = $1 AND estado = 'sending' AND intentos = $2`,
            [row.id, row.attempts],
          );
          return { kind: "retry_scheduled" as const };
        }
        await pool.query(
          `UPDATE dominio.envios_push SET estado = 'done', enviado_en = now(),
             arrendado_hasta = NULL WHERE id = $1 AND estado = 'sending' AND intentos = $2`,
          [row.id, row.attempts],
        );
        return { kind: "sent" as const };
      } catch {
        await pool.query(
          `UPDATE dominio.envios_push SET
             estado = CASE WHEN intentos >= 10 THEN 'dead' ELSE 'pending' END,
             arrendado_hasta = NULL,
             disponible_en = now() + least(interval '1 hour',
               power(2, least(intentos, 10)) * interval '5 seconds')
             WHERE id = $1 AND estado = 'sending' AND intentos = $2`,
          [row.id, row.attempts],
        );
        return { kind: "retry_scheduled" as const };
      }
    },
  };
}
export type PushDeliveryRepository = ReturnType<typeof createPushDeliveryRepository>;
