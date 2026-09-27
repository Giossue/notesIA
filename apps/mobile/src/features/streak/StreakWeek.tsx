import type { StreakView } from "@notesia/contracts";
import { StyleSheet, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";
import { dayLetters, flame } from "./streak-colors";

const statusLabel = {
  done: "ganado",
  rest: "descanso",
  pending: "pendiente",
  future: "futuro",
  missed: "sin completar",
} as const;

/** Fila L M M J V S D con un círculo por día: ✓ si ese día se completó una tarea. */
export function StreakWeek({ week, size = 34 }: { week: StreakView["week"]; size?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {week.map((day, index) => {
        const done = day.status === "done";
        const rest = day.status === "rest";
        const pending = day.status === "pending";
        return (
          <View key={day.date} style={styles.day}>
            <Text
              variant="labelMedium"
              style={[
                styles.letter,
                { color: pending || done ? flame.orange : theme.colors.onSurfaceVariant },
              ]}
            >
              {dayLetters[index]}
            </Text>
            <View
              accessibilityLabel={`${dayLetters[index]}: ${statusLabel[day.status]}`}
              style={[
                styles.circle,
                { width: size, height: size, borderRadius: size / 2 },
                done
                  ? { backgroundColor: flame.orange }
                  : { backgroundColor: theme.colors.surfaceVariant },
                pending && { borderWidth: 2, borderColor: flame.orange },
              ]}
            >
              {done && <Icon source="check-bold" size={size * 0.5} color="#FFFFFF" />}
              {rest && (
                <Icon source="pause" size={size * 0.5} color={theme.colors.onSurfaceVariant} />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch" },
  day: { alignItems: "center", gap: 6 },
  letter: { fontWeight: "700" },
  circle: { alignItems: "center", justifyContent: "center" },
});
