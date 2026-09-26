import { PermissionsAndroid, Platform } from "react-native";
import * as Keychain from "react-native-keychain";
import { v4 as uuidv4 } from "uuid";
import { registerPushDevice, removePushDevice } from "@/core/api/push-devices";

const deviceService = "ec.notesia.planner.push-device";

export async function getLocalPushDeviceId() {
  const stored = await Keychain.getGenericPassword({ service: deviceService });
  return stored ? stored.password : null;
}

async function firebaseMessaging() {
  const [{ getApps }, messagingModule] = await Promise.all([
    import("@react-native-firebase/app"),
    import("@react-native-firebase/messaging"),
  ]);
  if (getApps().length === 0)
    throw new Error("Las credenciales de Firebase aún no están instaladas en esta app.");
  return { messaging: messagingModule.getMessaging(), module: messagingModule };
}

/**
 * El usuario negó el permiso y marcó no volver a preguntar (o lo negó dos veces):
 * Android ya no muestra el diálogo y solo se puede activar desde sus Ajustes.
 */
export class PushPermissionBlockedError extends Error {
  constructor() {
    super("Las notificaciones están desactivadas para esta app. Actívalas en los Ajustes.");
  }
}

async function requestNotificationPermission() {
  if (Platform.OS === "android" && Platform.Version >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)
      throw new PushPermissionBlockedError();
    if (result !== PermissionsAndroid.RESULTS.GRANTED)
      throw new Error("Debes permitir notificaciones en Android para activar los avisos push.");
  }
  if (Platform.OS === "ios") {
    const { messaging, module } = await firebaseMessaging();
    const status = await module.requestPermission(messaging);
    if (
      status !== module.AuthorizationStatus.AUTHORIZED &&
      status !== module.AuthorizationStatus.PROVISIONAL
    )
      throw new Error("Debes permitir notificaciones en iOS para activar los avisos push.");
  }
}

export async function enablePushDevice() {
  await requestNotificationPermission();
  const { messaging, module } = await firebaseMessaging();
  await module.registerDeviceForRemoteMessages(messaging);
  const token = await module.getToken(messaging);
  const id = (await getLocalPushDeviceId()) ?? uuidv4();
  const result = await registerPushDevice({
    id,
    platform: Platform.OS === "ios" ? "ios" : "android",
    token,
  });
  await Keychain.setGenericPassword("push-device", id, {
    service: deviceService,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return result;
}

export async function disableCurrentPushDevice() {
  const id = await getLocalPushDeviceId();
  if (!id) return;
  let removalError: unknown = null;
  try {
    await removePushDevice(id);
  } catch (error) {
    removalError = error;
  }
  try {
    const { messaging, module } = await firebaseMessaging();
    await module.deleteToken(messaging);
  } catch {
    // The server registration is authoritative. A missing Firebase configuration or a local
    // token cleanup failure must not leave a removed device registered in the UI.
  } finally {
    await Keychain.resetGenericPassword({ service: deviceService });
  }
  if (removalError) throw removalError;
}

/** Lo que trae un aviso push: texto y a qué se refiere, para abrirlo. */
export type PushEvent = {
  title?: string;
  body?: string;
  notificationId?: string;
  type?: string;
  activityId?: string;
  planId?: string;
  reportId?: string;
};

type RemoteMessage = {
  notification?: { title?: string; body?: string };
  data?: Record<string, unknown>;
};

function toPushEvent(message: RemoteMessage | null | undefined): PushEvent | null {
  if (!message) return null;
  const text = (key: string) => {
    const value = message.data?.[key];
    return typeof value === "string" ? value : undefined;
  };
  return {
    title: message.notification?.title,
    body: message.notification?.body,
    notificationId: text("notificationId"),
    type: text("type"),
    activityId: text("activityId"),
    planId: text("planId"),
    reportId: text("reportId"),
  };
}

/**
 * Escucha los avisos: `onMessage` con la app abierta (Android no los muestra
 * solo en ese caso) y `onOpen` cuando el usuario toca uno en la bandeja,
 * también si la app estaba cerrada.
 */
export async function subscribeToPushEvents(handlers: {
  onMessage(event: PushEvent): void;
  onOpen(event: PushEvent): void;
}) {
  const { messaging, module } = await firebaseMessaging();
  const opened = toPushEvent(await module.getInitialNotification(messaging));
  if (opened) handlers.onOpen(opened);
  const unsubscribeOpened = module.onNotificationOpenedApp(messaging, (message) => {
    const event = toPushEvent(message);
    if (event) handlers.onOpen(event);
  });
  const unsubscribeMessage = module.onMessage(messaging, (message) => {
    const event = toPushEvent(message);
    if (event) handlers.onMessage(event);
  });
  const unsubscribeRefresh = module.onTokenRefresh(messaging, (token) => {
    void getLocalPushDeviceId().then((id) => {
      if (!id) return;
      void registerPushDevice({
        id,
        platform: Platform.OS === "ios" ? "ios" : "android",
        token,
      });
    });
  });
  return () => {
    unsubscribeOpened();
    unsubscribeMessage();
    unsubscribeRefresh();
  };
}
