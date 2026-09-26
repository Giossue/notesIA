import { Image, StatusBar, StyleSheet, View } from "react-native";

/** Mismo color que `splash_background` en res/values/colors.xml. */
export const SPLASH_BACKGROUND = "#0B0D14";

/**
 * Espera al abrir la app: igual a la pantalla de arranque de Android (fondo
 * oscuro y el ícono en un círculo de 160 dp al centro), para que no haya saltos.
 */
export function AppSplash({ label = "Cargando" }: { label?: string }) {
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.page]}
      accessibilityLabel={label}
      accessibilityRole="progressbar"
    >
      <StatusBar barStyle="light-content" backgroundColor={SPLASH_BACKGROUND} />
      <Image
        source={require("../../assets/splash-logo.png")}
        style={styles.logo}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPLASH_BACKGROUND,
  },
  logo: { width: 160, height: 160 },
});
