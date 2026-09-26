import type { PushSender } from "@notesia/db";
import { type PushNotificationType, pushMessage } from "@notesia/domain";
import { withTraceSpan } from "@notesia/observability";
import { GoogleAuth } from "google-auth-library";

/** Canal creado por la app en MainApplication.kt; los nombres deben coincidir. */
export const ANDROID_CHANNEL_ID = "avisos";

type Options = {
  projectId: string;
  /**
   * Cuenta de servicio en JSON, pensada para paneles como Dokploy donde es más
   * cómodo una variable que montar un archivo. Sin ella, GoogleAuth usa
   * GOOGLE_APPLICATION_CREDENTIALS.
   */
  serviceAccountJson?: string;
  getAccessToken?: () => Promise<string | null>;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
};

export function createFcmSender(options: Options): PushSender {
  if (!/^[a-z][a-z0-9-]{5,99}$/.test(options.projectId))
    throw new Error("FCM_PROJECT_ID is invalid");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    ...(options.serviceAccountJson ? { credentials: JSON.parse(options.serviceAccountJson) } : {}),
  });
  const getAccessToken = options.getAccessToken ?? (() => auth.getAccessToken());
  const fetcher = options.fetcher ?? fetch;
  const url = `https://fcm.googleapis.com/v1/projects/${options.projectId}/messages:send`;
  return (token, notification) =>
    withTraceSpan({ name: "provider.fcm", component: "provider", target: "fcm" }, async () => {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("FCM access token unavailable");
      const { title, body } = pushMessage({
        type: notification.type as PushNotificationType,
        activityTitle: notification.activityTitle,
        referenceAt: notification.referenceAt,
        timeZone: notification.timeZone,
        now: new Date(),
      });
      // FCM solo admite textos en data; la app los usa para abrir lo que avisa.
      const data: Record<string, string> = {
        notificationId: notification.id,
        type: notification.type,
      };
      if (notification.activityId) data.activityId = notification.activityId;
      if (notification.planId) data.planId = notification.planId;
      if (notification.reportId) data.reportId = notification.reportId;
      const response = await fetcher(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data,
            android: {
              // Alta: Android no la retrasa por ahorro de batería.
              priority: "HIGH",
              notification: {
                channel_id: ANDROID_CHANNEL_ID,
                icon: "ic_notification",
                color: "#3468E1",
                // Un reintento no duplica el aviso en la bandeja.
                tag: notification.id,
              },
            },
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) return "sent";
      if (response.status === 404) {
        const raw = await response.text();
        if (raw.length < 16000) {
          const data = JSON.parse(raw) as { error?: { details?: Array<{ errorCode?: string }> } };
          if (data.error?.details?.some((detail) => detail.errorCode === "UNREGISTERED"))
            return "unregistered";
        }
      }
      throw new Error("FCM delivery failed");
    });
}
