import type { ReactNode } from "react";
import { ScrollView, StatusBar, StyleSheet, useWindowDimensions, View } from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppSplash } from "@/shared/AppSplash";

/** Fondo oscuro fijo de la entrada, igual en modo claro y oscuro. */
export const heroColors = {
  background: "#0B0D14",
  text: "#FFFFFF",
  muted: "rgba(255, 255, 255, 0.68)",
  line: "rgba(255, 255, 255, 0.07)",
  glow: "#3468E1",
} as const;

const CELL = 56;

/**
 * Cuadrícula tenue con un brillo azul en la esquina superior derecha. Se dibuja
 * con vistas: un SVG de pantalla completa dejaba la primera pintura en negro.
 */
export function HeroBackdrop({ height }: { height: number }) {
  const { width } = useWindowDimensions();
  const columns = Array.from({ length: Math.ceil(width / CELL) }, (_, i) => (i + 1) * CELL);
  const rows = Array.from({ length: Math.ceil(height / CELL) }, (_, i) => (i + 1) * CELL);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop]}>
      {/* Capas concéntricas casi transparentes: un brillo difuso sin SVG. */}
      {[1.6, 1.25, 0.95, 0.7, 0.5].map((scale) => (
        <View
          key={scale}
          style={[
            styles.glow,
            {
              width: width * scale,
              height: width * scale,
              top: (-width * scale) / 2,
              right: (-width * scale) / 2,
            },
          ]}
        />
      ))}
      {columns.map((x) => (
        <View key={`c${x}`} style={[styles.column, { left: x, height }]} />
      ))}
      {rows.map((y) => (
        <View key={`r${y}`} style={[styles.row, { top: y, width }]} />
      ))}
    </View>
  );
}

export function HeroStatusBar() {
  return <StatusBar barStyle="light-content" backgroundColor={heroColors.background} />;
}

/** Cabecera de las pantallas de acceso: título grande y bajada. */
export function AuthHero({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  onBack?: () => void;
  children?: ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <HeroBackdrop height={320} />
      {onBack ? (
        <View style={styles.top}>
          <IconButton
            icon="arrow-left"
            iconColor={heroColors.text}
            onPress={onBack}
            accessibilityLabel="Volver"
            style={styles.back}
          />
        </View>
      ) : null}
      <Text variant="displaySmall" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodyLarge" style={styles.subtitle}>
        {subtitle}
      </Text>
      {children}
    </View>
  );
}

/** Pantalla de entrada: cabecera oscura y hoja blanca redondeada debajo. */
export function AuthLayout({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  onBack?: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView style={styles.dark} edges={["top"]}>
      <HeroStatusBar />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
        bounces={false}
      >
        <AuthHero title={title} subtitle={subtitle} onBack={onBack} />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
        >
          {children}
        </SafeAreaView>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Espera (logo de arranque) o error antes de entrar, sobre el mismo fondo oscuro. */
export function HeroStatus({
  label,
  message,
  action,
}: {
  label?: string;
  message?: string;
  action?: ReactNode;
}) {
  const { height } = useWindowDimensions();
  if (!message) return <AppSplash label={label} />;
  return (
    <SafeAreaView style={[styles.dark, styles.status]}>
      <HeroStatusBar />
      <HeroBackdrop height={height} />
      <Text accessibilityRole="alert" variant="bodyLarge" style={styles.statusText}>
        {message}
      </Text>
      {action}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: heroColors.background },
  scroll: { flexGrow: 1 },
  sheet: {
    flexGrow: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    gap: 20,
  },
  backdrop: { overflow: "hidden" },
  glow: { position: "absolute", borderRadius: 9999, backgroundColor: "rgba(52, 104, 225, 0.06)" },
  column: {
    position: "absolute",
    top: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: heroColors.line,
  },
  row: {
    position: "absolute",
    left: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: heroColors.line,
  },
  status: { alignItems: "center", justifyContent: "center", gap: 20, padding: 24 },
  statusText: { color: heroColors.text, textAlign: "center" },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
    gap: 10,
    overflow: "hidden",
  },
  top: { height: 48, justifyContent: "center", marginTop: -36, marginBottom: 12 },
  back: { margin: 0, marginLeft: -8 },
  title: { color: heroColors.text, fontWeight: "700" },
  subtitle: { color: heroColors.muted },
});
