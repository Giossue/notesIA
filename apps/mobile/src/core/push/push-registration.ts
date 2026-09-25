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

async function requestNotificationPermission() {
  if (Platform.OS === "android" && Platform.Version >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
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

export async function subscribeToPushEvents(onMessage: () => void) {
  const id = await getLocalPushDeviceId();
  if (!id) return () => {};
  const { messaging, module } = await firebaseMessaging();
  const unsubscribeRefresh = module.onTokenRefresh(messaging, (token) => {
    void registerPushDevice({
      id,
      platform: Platform.OS === "ios" ? "ios" : "android",
      token,
    });
  });
  const unsubscribeMessage = module.onMessage(messaging, onMessage);
  return () => {
    unsubscribeRefresh();
    unsubscribeMessage();
  };
}
