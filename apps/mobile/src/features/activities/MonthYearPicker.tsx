import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Icon, IconButton, Portal, Text, TouchableRipple, useTheme } from "react-native-paper";
import { layout } from "@/core/theme/layout";
import { Button, Dialog } from "@/shared/paper";

export const monthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function MonthYearPicker({
  year,
  month,
  onSelect,
  onDismiss,
}: {
  year: number;
  month: number;
  onSelect: (year: number, month: number) => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const [displayYear, setDisplayYear] = useState(year);
  const [choosingYear, setChoosingYear] = useState(false);
  const [firstYear, setFirstYear] = useState(1 + Math.floor((year - 1) / 12) * 12);
  const options = choosingYear
    ? Array.from({ length: 12 }, (_, index) => firstYear + index)
        .filter((option) => option <= 9999)
        .map((option) => ({
          key: String(option),
          label: String(option),
          accessibilityLabel: `Elegir año ${option}`,
          selected: option === displayYear,
          onPress: () => {
            setDisplayYear(option);
            setChoosingYear(false);
          },
        }))
    : monthNames.map((name, index) => ({
        key: name,
        label: name,
        accessibilityLabel: `${name} de ${displayYear}`,
        selected: displayYear === year && index + 1 === month,
        onPress: () => onSelect(displayYear, index + 1),
      }));

  return (
    <Portal>
      <Dialog visible onDismiss={onDismiss}>
        <Dialog.Title>Elegir mes y año</Dialog.Title>
        <Dialog.Content>
          <View style={styles.yearRow}>
            <IconButton
              icon="chevron-left"
              accessibilityLabel={choosingYear ? "Años anteriores" : "Año anterior"}
              disabled={choosingYear ? firstYear <= 1 : displayYear <= 1}
              onPress={() =>
                choosingYear
                  ? setFirstYear((value) => value - 12)
                  : setDisplayYear((value) => value - 1)
              }
              style={styles.yearButton}
            />
            <TouchableRipple
              borderless
              onPress={() => {
                setFirstYear(1 + Math.floor((displayYear - 1) / 12) * 12);
                setChoosingYear((value) => !value);
              }}
              accessibilityRole="button"
              accessibilityLabel={
                choosingYear ? "Mostrar meses" : `Elegir año, actual ${displayYear}`
              }
              accessibilityState={{ expanded: choosingYear }}
              style={styles.yearChoice}
            >
              <View style={styles.yearChoiceContent}>
                <Text variant="titleLarge" style={styles.year}>
                  {choosingYear ? `${firstYear}–${Math.min(firstYear + 11, 9999)}` : displayYear}
                </Text>
                <Icon source="menu-down" size={20} color={theme.colors.onSurfaceVariant} />
              </View>
            </TouchableRipple>
            <IconButton
              icon="chevron-right"
              accessibilityLabel={choosingYear ? "Años siguientes" : "Año siguiente"}
              disabled={choosingYear ? firstYear + 12 > 9999 : displayYear >= 9999}
              onPress={() =>
                choosingYear
                  ? setFirstYear((value) => value + 12)
                  : setDisplayYear((value) => value + 1)
              }
              style={styles.yearButton}
            />
          </View>
          <View style={styles.monthGrid}>
            {options.map((option) => (
              <View key={option.key} style={styles.monthCell}>
                <TouchableRipple
                  borderless
                  onPress={option.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={option.accessibilityLabel}
                  accessibilityState={{ selected: option.selected }}
                  style={[
                    styles.month,
                    option.selected && { backgroundColor: theme.colors.primaryContainer },
                  ]}
                >
                  <Text
                    variant="labelLarge"
                    style={{
                      color: option.selected
                        ? theme.colors.onPrimaryContainer
                        : theme.colors.onSurface,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableRipple>
              </View>
            ))}
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cerrar</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  yearButton: { width: layout.minTouch, height: layout.minTouch, margin: 0 },
  yearChoice: { minWidth: 128, minHeight: layout.minTouch, borderRadius: layout.smallRadius },
  yearChoiceContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: layout.minTouch,
    gap: 4,
  },
  year: { textAlign: "center", fontWeight: "700" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 16 },
  monthCell: { width: "33.333%", padding: 3 },
  month: {
    minHeight: layout.minTouch,
    borderRadius: layout.smallRadius,
    alignItems: "center",
    justifyContent: "center",
  },
});
