import type { StreakView } from "@notesia/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, StyleSheet, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getStreak } from "@/core/api/streak";
import { Button } from "@/shared/paper";
import { StreakWeek } from "./StreakWeek";
import { daysLabel, flame } from "./streak-colors";

function message(streak: StreakView) {
  if (streak.perfectWeeks > 1) return `¡Llevas ${streak.perfectWeeks} semanas perfectas seguidas!`;
  if (streak.current > 1 && streak.current === streak.best) return "¡Es tu mejor racha!";
  if (streak.current === 1)
    return "¡Empezaste tu racha! Se pausará los días sin tareas que venzan.";
  return "Completa una tarea cuando venza alguna para mantenerla.";
}

/**
 * Pantalla de celebración al ganar el día (la primera tarea completada hoy).
 * Tras cualquier cambio guardado se vuelve a consultar la racha; se celebra
 * solo cuando hoy pasa de "sin ganar" a "ganado" mientras la app está abierta.
 */
export function StreakCelebration() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const streak = useQuery({ queryKey: ["streak"], queryFn: getStreak, retry: false });
  const previous = useRef<StreakView | null>(null);
  const [shown, setShown] = useState<StreakView | null>(null);
  const scale = useRef(new Animated.Value(0)).current;
  const count = useRef(new Animated.Value(0)).current;
  const [number, setNumber] = useState(0);

  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "success")
          void queryClient.invalidateQueries({ queryKey: ["streak"] });
      }),
    [queryClient],
  );

  useEffect(() => {
    const data = streak.data;
    if (!data) return;
    const before = previous.current;
    previous.current = data;
    if (before && before.today === data.today && !before.todayDone && data.todayDone)
      setShown(data);
  }, [streak.data]);

  useEffect(() => {
    if (!shown) return;
    scale.setValue(0);
    count.setValue(Math.max(0, shown.current - 1));
    const listener = count.addListener(({ value }) => setNumber(Math.round(value)));
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(count, {
        toValue: shown.current,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
    return () => count.removeListener(listener);
  }, [shown, scale, count]);

  const background = theme.dark ? "#2B1D05" : "#FFF4D6";
  return (
    <Modal
      visible={shown !== null}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setShown(null)}
    >
      <View
        style={[
          styles.screen,
          {
            backgroundColor: background,
            paddingTop: insets.top + 48,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        {shown && (
          <>
            <View style={styles.center}>
              <Animated.View style={{ transform: [{ scale }] }}>
                <View style={[styles.glow, { backgroundColor: `${flame.yellow}33` }]}>
                  <Icon source="fire" size={140} color={flame.orange} />
                </View>
              </Animated.View>
              <Text style={[styles.number, { color: flame.orange }]}>{number}</Text>
              <Text variant="headlineSmall" style={[styles.label, { color: flame.orange }]}>
                {daysLabel(shown.current)} de racha
              </Text>
              <View style={[styles.weekCard, { backgroundColor: theme.colors.surface }]}>
                <StreakWeek week={shown.week} size={36} />
                <Text style={[styles.message, { color: theme.colors.onSurface }]}>
                  {message(shown)}
                </Text>
              </View>
            </View>
            <Button
              mode="contained"
              buttonColor={flame.orange}
              textColor="#FFFFFF"
              onPress={() => setShown(null)}
            >
              Continuar
            </Button>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between" },
  center: { alignItems: "center", gap: 8 },
  glow: {
    width: 190,
    height: 190,
    borderRadius: 95,
    alignItems: "center",
    justifyContent: "center",
  },
  number: { fontSize: 88, lineHeight: 96, fontWeight: "900" },
  label: { fontWeight: "800", marginTop: -8 },
  weekCard: { alignSelf: "stretch", borderRadius: 20, padding: 18, gap: 16, marginTop: 24 },
  message: { textAlign: "center", fontWeight: "600" },
});
