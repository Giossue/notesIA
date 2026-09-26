import { expect, test } from "bun:test";
import { createFcmSender } from "./fcm";

const notification = (type: string) => ({
  id: crypto.randomUUID(),
  type,
  activityId: crypto.randomUUID(),
  planId: null,
  reportId: null,
  activityTitle: "Entrega de Cálculo",
  referenceAt: new Date(Date.now() + 3_600_000),
  timeZone: "America/Guayaquil",
});

test("FCM HTTP v1 sends the real reminder with high priority and the app channel", async () => {
  let sentUrl = "";
  let sentHeaders = new Headers();
  let sentBody: unknown;
  const sender = createFcmSender({
    projectId: "notesia-test",
    getAccessToken: async () => "short-lived-test-token",
    fetcher: async (url, init) => {
      sentUrl = url;
      sentHeaders = new Headers(init.headers);
      sentBody = JSON.parse(String(init.body));
      return Response.json({ name: "projects/notesia-test/messages/1" });
    },
  });
  const reminder = notification("deadline_reminder");
  expect(await sender("device-test-token", reminder)).toBe("sent");
  expect(sentUrl).toBe("https://fcm.googleapis.com/v1/projects/notesia-test/messages:send");
  expect(sentHeaders.get("authorization")).toBe("Bearer short-lived-test-token");
  expect(sentBody).toMatchObject({
    message: {
      token: "device-test-token",
      notification: { title: "Plazo próximo" },
      data: {
        notificationId: reminder.id,
        type: "deadline_reminder",
        activityId: reminder.activityId,
      },
      android: {
        priority: "HIGH",
        notification: { channel_id: "avisos", icon: "ic_notification", tag: reminder.id },
      },
    },
  });
  expect(JSON.stringify(sentBody)).toContain("«Entrega de Cálculo» vence");
  expect(JSON.stringify(sentBody)).not.toContain("short-lived-test-token");
});

test("FCM invalidates only explicitly unregistered tokens", async () => {
  const options = { projectId: "notesia-test", getAccessToken: async () => "test-token" };
  const invalid = createFcmSender({
    ...options,
    fetcher: async () =>
      Response.json({ error: { details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 }),
  });
  expect(await invalid("device-token", notification("risk_alert"))).toBe("unregistered");
  const transient = createFcmSender({
    ...options,
    fetcher: async () => Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }),
  });
  await expect(transient("device-token", notification("risk_alert"))).rejects.toThrow(
    "FCM delivery failed",
  );
});
