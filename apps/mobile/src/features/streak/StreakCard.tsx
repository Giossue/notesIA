import { useQuery } from "@tanstack/react-query";
import { Animated, StyleSheet, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";
import { getStreak } from "@/core/api/streak";
import { layout } from "@/core/theme/layout";
import { usePulse } from "@/shared/motion";
import { StreakWeek } from "./StreakWeek";
import { daysLabel, flame } from "./streak-colors";

/** La llama se enciende al completar; un día sin tareas pausa la racha. */
export function StreakCard() {
  const theme = useTheme();
  const streak = useQuery({ queryKey: ["streak"], queryFn: getStreak, retry: false });
  const data = streak.data;
  // Con el día ganado, la llama "respira".
  const breathe = usePulse(!!data?.todayDone, 1.08, 1100);
  if (!data) return null;
  const lit = data.todayDone;
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.head}>
        <Animated.View style={{ transform: [{ scale: breathe }] }}>
          <Icon source="fire" size={52} color={lit ? flame.orange : flame.off} />
        </Animated.View>
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
              : data.todayRest
                ? data.current > 0
                  ? "Hoy no tienes tareas disponibles. Tu racha se pausa."
                  : "Hoy no tienes tareas disponibles."
                : data.current > 0
                  ? "Completa una tarea hoy para mantenerla."
                  : "Completa una tarea para empezar tu racha."}
          </Text>
        </View>
      </View>
      <StreakWeek week={data.week} />
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Mejor racha: {data.best} {daysLabel(data.best)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: layout.cardRadius, padding: 16, gap: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1, gap: 2 },
  number: { fontWeight: "800" },
});
