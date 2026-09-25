import * as Keychain from "react-native-keychain";
import { v4 as uuidv4 } from "uuid";

const service = "ec.notesia.planner.session";
const scopeService = "ec.notesia.planner.session-scope";

export async function getSessionCookie(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({ service });
  return credentials ? credentials.password : null;
}

export async function setSessionCookie(cookie: string): Promise<void> {
  await Keychain.setGenericPassword("session", cookie, { service });
  const currentScope = await Keychain.getGenericPassword({ service: scopeService });
  if (!currentScope)
    await Keychain.setGenericPassword("scope", uuidv4(), { service: scopeService });
}

export async function clearSessionCookie(): Promise<void> {
  await Promise.all([
    Keychain.resetGenericPassword({ service }),
    Keychain.resetGenericPassword({ service: scopeService }),
  ]);
}

export async function getSessionScope(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({ service: scopeService });
  return credentials ? credentials.password : null;
}
