import { type ReactNode, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Icon, Portal, Text, TouchableRipple, useTheme } from "react-native-paper";
import { Button, Dialog } from "@/shared/paper";

/** Explicación corta que se abre con la «i» junto al título. */
export type HeaderInfo = { title: string; text: string };

export type HeaderAction = { icon: string; label: string; onPress: () => void };

/** Encabezado de pantalla: acción izquierda, título centrado y acción derecha. */
export function ScreenHeader({
  title,
  left,
  right,
  rightExtra,
  info,
  children,
  compact,
}: {
  info?: HeaderInfo;
  title?: string;
  left?: HeaderAction;
  right?: HeaderAction;
  /** Segunda acción a la derecha, junto a `right`. */
  rightExtra?: HeaderAction;
  /** Sustituye al título centrado (por ejemplo, un saludo). */
  children?: ReactNode;
  /** Pegado al borde superior y con menos aire debajo, para dar espacio al contenido. */
  compact?: boolean;
}) {
  return (
    <View style={[styles.row, compact && styles.compact]}>
      {left ? <HeaderButton {...left} /> : <View style={styles.slot} />}
      {/* Con dos acciones a la derecha, un hueco igual a la izquierda mantiene el título centrado. */}
      {rightExtra && <View style={styles.slot} />}
      <View style={styles.middle}>
        {children ?? (
          <View style={styles.titleRow}>
            <Text
              variant="titleLarge"
              style={styles.title}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title}
            </Text>
            {info && <InfoButton info={info} />}
          </View>
        )}
      </View>
      {rightExtra && <HeaderButton {...rightExtra} />}
      {right ? <HeaderButton {...right} /> : <View style={styles.slot} />}
    </View>
  );
}

function InfoButton({ info }: { info: HeaderInfo }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableRipple
        borderless
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={info.title}
        style={styles.info}
      >
        <Icon source="information-outline" size={20} color={theme.colors.onSurfaceVariant} />
      </TouchableRipple>
      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)}>
          <Dialog.Title>{info.title}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{info.text}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>Entendido</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
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
  title: { fontWeight: "700", flexShrink: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },
  info: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
