import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { StatusBar, useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";
import { AppSplash } from "@/shared/AppSplash";
import { ToastProvider } from "@/shared/Toast";
import {
  type AppearancePreference,
  readAppearancePreference,
  writeAppearancePreference,
} from "./appearance-storage";
import { renderIcon } from "./icons";
import { darkTheme, lightTheme } from "./theme";

type AppearanceContextValue = {
  preference: AppearancePreference;
  setPreference: (value: AppearancePreference) => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("AppearanceProvider is required");
  return context;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void readAppearancePreference()
      .then((saved) => {
        if (mounted) setPreferenceState(saved);
      })
      .catch(() => {
        // Keep the light default if local preferences cannot be read.
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = async (value: AppearancePreference) => {
    await writeAppearancePreference(value);
    setPreferenceState(value);
  };
  const isDark = preference === "dark" || (preference === "system" && systemScheme === "dark");
  const theme = isDark ? darkTheme : lightTheme;

  return (
    <AppearanceContext.Provider value={{ preference, setPreference }}>
      <PaperProvider theme={theme} settings={{ icon: renderIcon }}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          // Transparente: cada pantalla pinta detrás de la barra de estado (el panel
          // del encabezado la cubre); las zonas seguras reservan su espacio.
          translucent
          backgroundColor="transparent"
        />
        {ready ? <ToastProvider>{children}</ToastProvider> : <AppSplash />}
      </PaperProvider>
    </AppearanceContext.Provider>
  );
}
