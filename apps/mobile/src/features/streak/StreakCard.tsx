import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";
import { getStreak } from "@/core/api/streak";
import { layout } from "@/core/theme/layout";
import { StreakWeek } from "./StreakWeek";
import { daysLabel, flame } from "./streak-colors";

/** Racha actual: la llama se apaga (gris) mientras hoy no haya una tarea completada. */
export function StreakCard() {
  const theme = useTheme();
  const streak = useQuery({ queryKey: ["streak"], queryFn: getStreak, retry: false });
  const data = streak.data;
  if (!data) return null;
  const lit = data.todayDone;
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.head}>
        <Icon source="fire" size={52} color={lit ? flame.orange : flame.off} />
        <View style={styles.flex}>
          <Text
            variant="headlineMedium"
            style={[styles.number, { color: lit ? flame.orange : theme.colors.onSurface }]}
          >
            {data.current} {daysLabel(data.current)}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {lit
              ? "¡Racha encendida hoy!"
              : data.current > 0
                ? "Completa una tarea hoy para mantenerla."
                : "Completa una tarea para empezar tu racha."}
          </Text>
        </View>
      </View>
      <StreakWeek week={data.week} />
      <View style={styles.foot}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Mejor racha: {data.best} {daysLabel(data.best)}
        </Text>
        <View style={styles.freeze}>
          <Icon
            source="snowflake"
            size={16}
            color={data.freezeAvailable ? flame.ice : theme.colors.onSurfaceVariant}
          />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {data.freezeAvailable ? "Protector listo" : "Protector usado esta semana"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: layout.cardRadius, padding: 16, gap: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1, gap: 2 },
  number: { fontWeight: "800" },
  foot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  freeze: { flexDirection: "row", alignItems: "center", gap: 4 },
});
