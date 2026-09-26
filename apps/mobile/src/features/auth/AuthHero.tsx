import type { ReactNode } from "react";
import { Image, StatusBar, StyleSheet, useWindowDimensions, View } from "react-native";
import { IconButton, Text } from "react-native-paper";
import Svg, { Defs, Line, RadialGradient, Rect, Stop } from "react-native-svg";

/** Fondo oscuro fijo de la entrada, igual en modo claro y oscuro. */
export const heroColors = {
  background: "#0B0D14",
  text: "#FFFFFF",
  muted: "rgba(255, 255, 255, 0.68)",
  line: "rgba(255, 255, 255, 0.07)",
  glow: "#3468E1",
} as const;

const CELL = 56;

/** Cuadrícula tenue con un brillo azul en la esquina superior derecha. */
export function HeroBackdrop({ height }: { height: number }) {
  const { width } = useWindowDimensions();
  const columns = Array.from({ length: Math.ceil(width / CELL) }, (_, i) => (i + 1) * CELL);
  const rows = Array.from({ length: Math.ceil(height / CELL) }, (_, i) => (i + 1) * CELL);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="glow" cx={width} cy={0} r={width * 0.9} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={heroColors.glow} stopOpacity={0.35} />
          <Stop offset="1" stopColor={heroColors.glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {columns.map((x) => (
        <Line key={`c${x}`} x1={x} x2={x} y1={0} y2={height} stroke={heroColors.line} />
      ))}
      {rows.map((y) => (
        <Line key={`r${y}`} x1={0} x2={width} y1={y} y2={y} stroke={heroColors.line} />
      ))}
      <Rect width={width} height={height} fill="url(#glow)" />
    </Svg>
  );
}

export function HeroStatusBar() {
  return <StatusBar barStyle="light-content" backgroundColor={heroColors.background} />;
}

export function AppLogo({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require("../../../assets/icon.png")}
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
      accessibilityIgnoresInvertColors
    />
  );
}

/** Cabecera de las pantallas de acceso: logo, título grande y bajada. */
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
      <View style={styles.top}>
        {onBack ? (
          <IconButton
            icon="arrow-left"
            iconColor={heroColors.text}
            onPress={onBack}
            accessibilityLabel="Volver"
            style={styles.back}
          />
        ) : (
          <AppLogo />
        )}
      </View>
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

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 10,
    overflow: "hidden",
  },
  top: { height: 48, justifyContent: "center", marginBottom: 12 },
  back: { margin: 0, marginLeft: -8 },
  title: { color: heroColors.text, fontWeight: "700" },
  subtitle: { color: heroColors.muted },
});
