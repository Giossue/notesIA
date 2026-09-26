import { StyleSheet, View } from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { layout } from "@/core/theme/layout";
import { TimeField } from "@/shared/fields";
import { Button, Card } from "@/shared/paper";
import { clockToMinute } from "./time";

export const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Un tramo de horas de un día ("HH:mm"). */
export type HourSlot = { key: string; start: string; end: string };

export const dailyChoices = [
  { value: "60", label: "1 h" },
  { value: "120", label: "2 h" },
  { value: "180", label: "3 h" },
  { value: "240", label: "4 h" },
  { value: "360", label: "6 h" },
] as const;

export const closestDaily = (minutes: number) =>
  dailyChoices.reduce((best, choice) =>
    Math.abs(Number(choice.value) - minutes) < Math.abs(Number(best.value) - minutes)
      ? choice
      : best,
  ).value;

/** Dos horas después de `start`, sin pasar de las 23. */
export const twoHoursAfter = (start: string) =>
  `${String(Math.min(23, Number(start.slice(0, 2)) + 2)).padStart(2, "0")}:${start.slice(3)}`;

/** Si el fin es igual o anterior al inicio, el tramo termina al día siguiente. */
export function toMinutes(start: string, end: string) {
  const startMinute = clockToMinute(start);
  const endClock = clockToMinute(end);
  return { startMinute, endMinute: endClock > startMinute ? endClock : endClock + 1440 };
}

/** Los 7 días de la semana, cada uno con sus tramos Desde/Hasta. */
export function WeeklyHoursEditor<S extends HourSlot>({
  days,
  onChangeDay,
  emptyText = "Sin horas de estudio.",
}: {
  days: S[][];
  onChangeDay(weekday: number, change: (slots: S[]) => S[]): void;
  emptyText?: string;
}) {
  const theme = useTheme();
  return (
    <>
      {days.map((slots, index) => (
        <Card key={weekdays[index]} mode="contained">
          <Card.Content style={styles.group}>
            <View style={styles.dayHeader}>
              <Text variant="titleMedium" style={styles.flex}>
                {weekdays[index]}
              </Text>
              <Button
                compact
                icon="plus"
                onPress={() =>
                  onChangeDay(index, (current) => {
                    const start = current.at(-1)?.end ?? "15:00";
                    return [...current, { key: uuidv4(), start, end: twoHoursAfter(start) } as S];
                  })
                }
              >
                Agregar
              </Button>
            </View>
            {slots.length === 0 && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {emptyText}
              </Text>
            )}
            {slots.map((slot, position) => (
              <View key={slot.key} style={styles.slotRow}>
                <View style={styles.flex}>
                  <TimeField
                    label="Desde"
                    value={slot.start}
                    onChange={(start) =>
                      onChangeDay(index, (current) =>
                        current.map((item) => (item.key === slot.key ? { ...item, start } : item)),
                      )
                    }
                  />
                </View>
                <View style={styles.flex}>
                  <TimeField
                    label="Hasta"
                    value={slot.end}
                    onChange={(end) =>
                      onChangeDay(index, (current) =>
                        current.map((item) => (item.key === slot.key ? { ...item, end } : item)),
                      )
                    }
                  />
                </View>
                <IconButton
                  icon="close"
                  size={20}
                  accessibilityLabel={`Quitar horario ${position + 1} del ${weekdays[index]}`}
                  onPress={() =>
                    onChangeDay(index, (current) => current.filter((item) => item.key !== slot.key))
                  }
                  style={styles.remove}
                />
              </View>
            ))}
          </Card.Content>
        </Card>
      ))}
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Si la hora de fin es anterior a la de inicio, el horario termina al día siguiente.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.itemGap },
  flex: { flex: 1 },
  dayHeader: { flexDirection: "row", alignItems: "center" },
  slotRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  remove: { margin: 0, marginTop: 6 },
});
