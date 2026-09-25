import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple, useTheme } from "react-native-paper";

/**
 * Selector de opciones del sistema, tanto para filtrar listas (Activas /
 * Archivadas) como para elegir un valor en formularios (idioma, tema…): riel
 * gris y la opción activa como una pastilla blanca elevada.
 */
export function Tabs<T extends string>({
  value,
  onValueChange,
  buttons,
}: {
  value: T;
  onValueChange: (value: T) => void;
  buttons: { value: T; label: string; disabled?: boolean }[];
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, { backgroundColor: theme.colors.surfaceVariant }]}
    >
      {buttons.map((button) => {
        const selected = button.value === value;
        return (
          <TouchableRipple
            key={button.value}
            borderless
            onPress={() => onValueChange(button.value)}
            disabled={button.disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: button.disabled }}
            style={[
              styles.tab,
              selected && [
                styles.selected,
                { backgroundColor: theme.colors.surface, shadowColor: theme.colors.shadow },
              ],
            ]}
          >
            <Text
              variant="titleSmall"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{
                color: selected ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                fontWeight: selected ? "700" : "500",
              }}
            >
              {button.label}
            </Text>
          </TouchableRipple>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Pastilla completa: excepción al radio global para las pestañas.
  track: { flexDirection: "row", borderRadius: 999, padding: 4, gap: 4 },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: {
    elevation: 2,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
