import * as Keychain from "react-native-keychain";

const service = "ec.notesia.planner.session";

export async function getSessionCookie(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({ service });
  return credentials ? credentials.password : null;
}

export async function setSessionCookie(cookie: string): Promise<void> {
  await Keychain.setGenericPassword("session", cookie, { service });
}

export async function clearSessionCookie(): Promise<void> {
  await Keychain.resetGenericPassword({ service });
}
