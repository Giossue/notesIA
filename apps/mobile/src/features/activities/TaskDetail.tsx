import type { Activity, Profile } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { Icon, ProgressBar, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { updateActivityProgress } from "@/core/api/activities";
import { OfflineQueuedError } from "@/core/api/api-error";
import { patchCached } from "@/core/offline/optimistic";
import { layout } from "@/core/theme/layout";
import { categoryColors } from "@/core/theme/theme";
import { kindColor, kindLabel } from "@/shared/activity-kinds";
import { Tabs } from "@/shared/Tabs";
import { TaskStatus } from "./ActivityActions";
import { SubtasksSection } from "./SubtasksSection";

const priorityLabels = { low: "baja", medium: "media", high: "alta", critical: "crítica" };
const progressSteps = ["0", "25", "50", "75", "100"] as const;

/** "vie 2 oct, 23:59" en la zona del perfil. */
function deadlineText(iso: string, timeZone: string) {
  return new Date(iso)
    .toLocaleString("es", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
    .replaceAll(".", "");
}

const hours = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.round((minutes / 60) * 10) / 10} h`;

/**
 * Una tarea abierta: lo esencial arriba, su progreso, su estado y sus
 * subtareas. Editar, historial, archivar y eliminar están en el menú ⋮.
 */
export function TaskDetail({ activity, profile }: { activity: Activity; profile: Profile }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const color = categoryColors[theme.dark ? "dark" : "light"][kindColor(activity.kind)];
  const progress = useMutation({
    mutationFn: (value: number) => {
      patchCached<Activity>(
        queryClient,
        [["activity", activity.id], ["activities"], ["agenda-upcoming-home"]],
        activity.id,
        { progressPercent: value, version: activity.version + 1 },
      );
      return updateActivityProgress(activity.id, activity.version, uuidv4(), value);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["activity", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["activity-summary"] });
    },
    onError: (error) => {
      if (!(error instanceof OfflineQueuedError))
        void queryClient.invalidateQueries({ queryKey: ["activity", activity.id] });
    },
  });
  const nearest = progressSteps.reduce((best, step) =>
    Math.abs(Number(step) - activity.progressPercent) <
    Math.abs(Number(best) - activity.progressPercent)
      ? step
      : best,
  );
  const editable = !activity.archivedAt && activity.status !== "cancelled";

  return (
    <View style={styles.page}>
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.kindRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            {kindLabel(activity.kind)} · prioridad {priorityLabels[activity.priority]}
          </Text>
        </View>
        <Text variant="headlineSmall" style={styles.bold}>
          {activity.title}
        </Text>
        {activity.description && (
          <Text style={{ color: theme.colors.onSurfaceVariant }}>{activity.description}</Text>
        )}
        <View style={styles.facts}>
          {activity.deadlineAt && (
            <View style={styles.fact}>
              <Icon source="calendar-clock" size={18} color={theme.colors.onSurfaceVariant} />
              <Text>Entrega: {deadlineText(activity.deadlineAt, profile.timeZone)}</Text>
            </View>
          )}
          {activity.estimatedMinutes && (
            <View style={styles.fact}>
              <Icon source="timer-sand" size={18} color={theme.colors.onSurfaceVariant} />
              <Text>Tiempo estimado: {hours(activity.estimatedMinutes)}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.progressHead}>
          <Text variant="titleLarge" style={[styles.bold, styles.flex]}>
            Progreso
          </Text>
          <Text variant="titleLarge" style={{ color: theme.colors.primary }}>
            {activity.progressPercent}%
          </Text>
        </View>
        <ProgressBar progress={activity.progressPercent / 100} style={styles.bar} />
        {editable && (
          <Tabs
            value={nearest}
            onValueChange={(value) => {
              if (Number(value) !== activity.progressPercent) progress.mutate(Number(value));
            }}
            buttons={progressSteps.map((step) => ({ value: step, label: `${step}%` }))}
          />
        )}
      </View>

      <View style={styles.section}>
        <Text variant="titleLarge" style={styles.bold}>
          Estado
        </Text>
        <TaskStatus activity={activity} offline={offline} />
      </View>

      <SubtasksSection activity={activity} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: layout.sectionGap },
  card: { borderRadius: layout.cardRadius, padding: 18, gap: 8 },
  kindRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bold: { fontWeight: "700" },
  flex: { flex: 1 },
  facts: { gap: 6, marginTop: 4 },
  fact: { flexDirection: "row", alignItems: "center", gap: 8 },
  section: { gap: 10 },
  progressHead: { flexDirection: "row", alignItems: "center" },
  bar: { height: 8, borderRadius: 4 },
});
