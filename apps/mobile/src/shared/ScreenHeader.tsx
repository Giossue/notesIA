import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Icon, Text, TouchableRipple, useTheme } from "react-native-paper";

export type HeaderAction = { icon: string; label: string; onPress: () => void };

/** Encabezado de pantalla: acción izquierda, título centrado y acción derecha. */
export function ScreenHeader({
  title,
  left,
  right,
  children,
  compact,
}: {
  title?: string;
  left?: HeaderAction;
  right?: HeaderAction;
  /** Sustituye al título centrado (por ejemplo, un saludo). */
  children?: ReactNode;
  /** Pegado al borde superior y con menos aire debajo, para dar espacio al contenido. */
  compact?: boolean;
}) {
  return (
    <View style={[styles.row, compact && styles.compact]}>
      {left ? <HeaderButton {...left} /> : <View style={styles.slot} />}
      <View style={styles.middle}>
        {children ?? (
          <Text
            variant="titleLarge"
            style={styles.title}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Text>
        )}
      </View>
      {right ? <HeaderButton {...right} /> : <View style={styles.slot} />}
    </View>
  );
}

export function HeaderButton({ icon, label, onPress }: HeaderAction) {
  const theme = useTheme();
  return (
    <TouchableRipple
      borderless
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.slot}
    >
      <Icon source={icon} size={26} color={theme.colors.onSurface} />
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56 },
  slot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  compact: { marginTop: -16, marginBottom: -12 },
  middle: { flex: 1, alignItems: "center" },
  title: { fontWeight: "700" },
});
