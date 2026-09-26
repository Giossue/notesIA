import * as Keychain from "react-native-keychain";

const service = "ec.notesia.planner.welcome";

/** La bienvenida se muestra una sola vez por instalación. */
export async function readWelcomeSeen(): Promise<boolean> {
  return Boolean(await Keychain.getGenericPassword({ service }));
}

export async function writeWelcomeSeen(): Promise<void> {
  await Keychain.setGenericPassword("welcome", "seen", { service });
}
