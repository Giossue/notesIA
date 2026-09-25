/**
 * @format
 */

import "react-native-get-random-values";
import { AppRegistry, NativeModules } from "react-native";
import { name as appName } from "./app.json";

globalThis.__NOTESIA_API_BASE_URL__ = NativeModules.NotesIAConfig?.apiBaseUrl;

AppRegistry.registerComponent(appName, () => require("./App").default);
