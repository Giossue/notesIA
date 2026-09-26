import { shiftLocalDate } from "@notesia/domain";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Icon, Text, useTheme } from "react-native-paper";
import { getActivitySummary } from "@/core/api/activities";
import { layout } from "@/core/theme/layout";
import { categoryColors } from "@/core/theme/theme";
import { TimeStatisticsPanel } from "@/features/time/TimeStatisticsPanel";
import { categoryInfo } from "@/shared/activity-kinds";
import { userMessage } from "@/shared/errors";
import { percent, shortRange, shortWeekday } from "@/shared/format";
import { ProgressRings } from "@/shared/ProgressRings";
import { Button } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";

const BAR_HEIGHT = 130;

export function ProgressScreen() {
  const theme = useTheme();
  const categories = categoryColors[theme.dark ? "dark" : "light"];
  const summary = useQuery({
    queryKey: ["activity-summary"],
    queryFn: getActivitySummary,
    retry: false,
  });
  const data = summary.data;
  const weekPercent = data ? percent(data.week.completedDue, data.week.due) : 0;
  const rings = data
    ? [
        { progress: weekPercent / 100, color: categories.blue },
        ...data.categories
          .filter((row) => row.total > 0)
          .map((row) => ({
            progress: row.completed / row.total,
            color: categories[categoryInfo[row.category].color],
          })),
      ]
    : [];
  const barMax = data
    ? Math.max(1, ...data.week.days.map((row) => Math.max(row.due, row.completed)))
    : 1;

  return (
    <ScreenLayout
      tab="Progress"
      header={{
        title: "Progreso",
        left: null,
      }}
    >
      {summary.isPending && <ActivityIndicator accessibilityLabel="Cargando progreso" />}
      {summary.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(summary.error)}</Text>
          <Button onPress={() => void summary.refetch()}>Reintentar</Button>
        </View>
      )}

      {data && (
        <>
          <View style={[styles.card, styles.ringsCard, { backgroundColor: theme.colors.surface }]}>
            <ProgressRings rings={rings} size={148} stroke={11} gap={6}>
              <Text variant="headlineSmall" style={styles.bold}>
                {weekPercent}%
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Completado
              </Text>
            </ProgressRings>
            <View style={styles.legend}>
              <View>
                <Text variant="titleMedium" style={styles.bold}>
                  Esta semana
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {shortRange(data.week.from, shiftLocalDate(data.week.through, -1))}
                </Text>
              </View>
              <LegendRow color={categories.blue} label="Entregas" value={weekPercent} />
              {data.categories
                .filter((row) => row.total > 0)
                .map((row) => (
                  <LegendRow
                    key={row.category}
                    color={categories[categoryInfo[row.category].color]}
                    label={categoryInfo[row.category].label}
                    value={percent(row.completed, row.total)}
                  />
                ))}
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {data.week.completedDue} de {data.week.due} entregas de la semana
              </Text>
            </View>
          </View>

          <View style={[styles.card, styles.chartCard, { backgroundColor: theme.colors.surface }]}>
            <View>
              <Text variant="titleLarge" style={styles.bold}>
                Actividad de la semana
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Tareas completadas por día
              </Text>
            </View>
            <View style={styles.bars}>
              {data.week.days.map((row) => {
                const isToday = row.date === data.day;
                const ghost = (Math.max(row.due, row.completed) / barMax) * BAR_HEIGHT;
                const fill = (row.completed / barMax) * BAR_HEIGHT;
                return (
                  <View
                    key={row.date}
                    style={styles.barColumn}
                    accessible
                    accessibilityLabel={`${shortWeekday(row.date)}: ${row.completed} completadas de ${row.due} con plazo`}
                  >
                    <Text variant="labelLarge" style={styles.bold}>
                      {row.completed}
                    </Text>
                    <View style={[styles.barTrack, { height: BAR_HEIGHT }]}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: Math.max(ghost, 8),
                            backgroundColor: theme.colors.surfaceVariant,
                          },
                        ]}
                      />
                      {fill > 0 && (
                        <View
                          style={[
                            styles.bar,
                            styles.barFill,
                            { height: Math.max(fill, 8), backgroundColor: theme.colors.primary },
                          ]}
                        />
                      )}
                    </View>
                    <Text
                      variant="labelMedium"
                      style={[
                        { color: isToday ? theme.colors.primary : theme.colors.onSurfaceVariant },
                        isToday && styles.bold,
                      ]}
                    >
                      {shortWeekday(row.date)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text variant="titleLarge" style={styles.bold}>
              Por tipo de actividad
            </Text>
            <View style={styles.categories}>
              {data.categories.map((row) => {
                const info = categoryInfo[row.category];
                const color = categories[info.color];
                const value = percent(row.completed, row.total);
                return (
                  <View
                    key={row.category}
                    style={[
                      styles.card,
                      styles.categoryCard,
                      { backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <View style={[styles.categoryIcon, { backgroundColor: color }]}>
                      <Icon source={info.icon} size={22} color="#FFFFFF" />
                    </View>
                    <Text variant="titleSmall" numberOfLines={1} style={styles.bold}>
                      {info.label}
                    </Text>
                    <Text variant="headlineSmall" style={styles.bold}>
                      {value}%
                    </Text>
                    <View style={[styles.track, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <View
                        style={[styles.trackFill, { width: `${value}%`, backgroundColor: color }]}
                      />
                    </View>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {row.completed} de {row.total}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View
            style={[styles.card, styles.streak, { backgroundColor: theme.colors.errorContainer }]}
          >
            <View style={[styles.streakIcon, { backgroundColor: theme.colors.surface }]}>
              <Icon source="trophy-outline" size={24} color={categories.pink} />
            </View>
            <View style={styles.streakCopy}>
              <Text variant="titleMedium" style={styles.bold}>
                {data.streakDays === 0
                  ? "Empieza tu racha"
                  : `Racha de ${data.streakDays} ${data.streakDays === 1 ? "día" : "días"}`}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {data.streakDays === 0
                  ? "Completa una tarea hoy para comenzar."
                  : "Días seguidos completando al menos una tarea."}
              </Text>
            </View>
          </View>
        </>
      )}
      {/* Tiempo estudiado frente al estimado; se registra desde cada tarea. */}
      <TimeStatisticsPanel />
    </ScreenLayout>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  const theme = useTheme();
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="bodyMedium" numberOfLines={1} style={styles.legendLabel}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {value}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  message: { gap: layout.itemGap },
  bold: { fontWeight: "700" },
  card: { borderRadius: layout.cardRadius },
  ringsCard: { flexDirection: "row", alignItems: "center", gap: 16, padding: 18 },
  legend: { flex: 1, gap: 10 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendLabel: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chartCard: { padding: 18, gap: 18 },
  bars: { flexDirection: "row", gap: 8 },
  barColumn: { flex: 1, alignItems: "center", gap: 6 },
  barTrack: { width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 4 },
  barFill: { position: "absolute", bottom: 0 },
  section: { gap: 12 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  more: { borderRadius: layout.smallRadius, paddingVertical: 6, paddingLeft: 8 },
  moreContent: { flexDirection: "row", alignItems: "center", gap: 2 },
  categories: { flexDirection: "row", gap: 10 },
  categoryCard: { flex: 1, padding: 14, gap: 6 },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  trackFill: { height: 8, borderRadius: 4 },
  streak: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  streakIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  streakCopy: { flex: 1, gap: 2 },
});
