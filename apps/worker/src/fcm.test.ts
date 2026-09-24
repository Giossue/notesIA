import { expect, test } from "bun:test";
import { createFcmSender } from "./fcm";

test("FCM HTTP v1 sends only an opaque notification reference", async () => {
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
  const notificationId = crypto.randomUUID();
  expect(await sender("device-test-token", notificationId, "deadline_reminder")).toBe("sent");
  expect(sentUrl).toBe("https://fcm.googleapis.com/v1/projects/notesia-test/messages:send");
  expect(sentHeaders.get("authorization")).toBe("Bearer short-lived-test-token");
  expect(sentBody).toMatchObject({
    message: {
      token: "device-test-token",
      notification: { title: "NotesIA" },
      data: { notificationId, type: "deadline_reminder" },
    },
  });
  expect(JSON.stringify(sentBody)).not.toContain("short-lived-test-token");
});

test("FCM invalidates only explicitly unregistered tokens", async () => {
  const options = { projectId: "notesia-test", getAccessToken: async () => "test-token" };
  const invalid = createFcmSender({
    ...options,
    fetcher: async () =>
      Response.json({ error: { details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 }),
  });
  expect(await invalid("device-token", crypto.randomUUID(), "risk_alert")).toBe("unregistered");
  const transient = createFcmSender({
    ...options,
    fetcher: async () => Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }),
  });
  await expect(transient("device-token", crypto.randomUUID(), "risk_alert")).rejects.toThrow(
    "FCM delivery failed",
  );
});
