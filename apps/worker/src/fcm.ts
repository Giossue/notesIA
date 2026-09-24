import type { PushSender } from "@notesia/db";
import { GoogleAuth } from "google-auth-library";

type Options = {
  projectId: string;
  getAccessToken?: () => Promise<string | null>;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
};

export function createFcmSender(options: Options): PushSender {
  if (!/^[a-z][a-z0-9-]{5,99}$/.test(options.projectId))
    throw new Error("FCM_PROJECT_ID is invalid");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const getAccessToken = options.getAccessToken ?? (() => auth.getAccessToken());
  const fetcher = options.fetcher ?? fetch;
  const url = `https://fcm.googleapis.com/v1/projects/${options.projectId}/messages:send`;
  return async (token, notificationId, type) => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("FCM access token unavailable");
    const response = await fetcher(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: "NotesIA", body: "Tienes un aviso nuevo" },
          data: { notificationId, type },
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
  };
}
