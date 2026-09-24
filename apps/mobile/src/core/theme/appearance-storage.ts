import * as Keychain from "react-native-keychain";

export type AppearancePreference = "light" | "dark" | "system";

const service = "ec.notesia.planner.appearance";

export async function readAppearancePreference(): Promise<AppearancePreference> {
  const saved = await Keychain.getGenericPassword({ service });
  const value = saved ? saved.password : null;
  return value === "light" || value === "dark" || value === "system" ? value : "light";
}

export async function writeAppearancePreference(value: AppearancePreference): Promise<void> {
  await Keychain.setGenericPassword("appearance", value, { service });
}
