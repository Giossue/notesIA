/**
 * @format
 */

import "react-native-get-random-values";
import { getApps } from "@react-native-firebase/app";
import { getMessaging, setBackgroundMessageHandler } from "@react-native-firebase/messaging";
import { AppRegistry, NativeModules } from "react-native";
import { name as appName } from "./app.json";

globalThis.__NOTESIA_API_BASE_URL__ = NativeModules.NotesIAConfig?.apiBaseUrl;

if (getApps().length > 0) {
  setBackgroundMessageHandler(getMessaging(), async () => {});
}

AppRegistry.registerComponent(appName, () => require("./App").default);
