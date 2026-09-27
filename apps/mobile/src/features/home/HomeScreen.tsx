import type { Activity } from "@notesia/contracts";
import { shiftLocalDate, todayInTimeZone, utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Animated, LayoutAnimation, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Icon, Text, TouchableRipple, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { getActivitySummary, listActivities, transitionActivity } from "@/core/api/activities";
import { OfflineQueuedError } from "@/core/api/api-error";
import { getProfile } from "@/core/api/profile";
import { patchCached } from "@/core/offline/optimistic";
import { layout } from "@/core/theme/layout";
import { categoryColors } from "@/core/theme/theme";
import { OfflineBanner } from "@/features/offline/OfflineBanner";
import { StreakCard } from "@/features/streak/StreakCard";
import type { RootStackParamList } from "@/navigation/types";
import { useExitOnDoubleBack } from "@/navigation/useExitOnDoubleBack";
import { categoryInfo, kindColor, kindLabel } from "@/shared/activity-kinds";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { clockTime, longDate, percent, shortWeekday } from "@/shared/format";
import { useBounce } from "@/shared/motion";
import { PieIcon } from "@/shared/PieIcon";
import { ProgressRings } from "@/shared/ProgressRings";
import { Button } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { HomeHeader } from "./HomeHeader";

export function HomeScreen() {
  useExitOnDoubleBack();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const categories = categoryColors[theme.dark ? "dark" : "light"];
  const offline = useNetInfo().isConnected === false;
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const summary = useQuery({
    queryKey: ["activity-summary"],
    queryFn: getActivitySummary,
    retry: false,
  });
  const timeZone = profile.data?.timeZone;
  const day = timeZone ? todayInTimeZone(new Date().toISOString(), timeZone) : null;
  const upcoming = useInfiniteQuery({
    queryKey: ["agenda-upcoming-home", day],
    queryFn: ({ pageParam }) =>
      listActivities({
        dueFrom: day ?? undefined,
        dueThrough: day ? shiftLocalDate(day, 8) : undefined,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!day,
    retry: false,
  });
  const toggle = useMutation({
    mutationFn: (activity: Activity) => {
      const completing = activity.status !== "completed";
      // Se marca al instante; sin conexión queda en el teléfono y se envía después.
      patchCached<Activity>(
        queryClient,
        [["agenda-upcoming-home"], ["activities"], ["agenda"], ["activity", activity.id]],
        activity.id,
        {
          status: completing ? "completed" : "backlog",
          version: activity.version + 1,
          ...(completing ? { progressPercent: 100 } : {}),
        },
      );
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      return transitionActivity(
        activity.id,
        activity.version,
        uuidv4(),
        completing ? "complete" : "reopen",
      );
    },
    onError: (error) => {
      if (!(error instanceof OfflineQueuedError))
        void queryClient.invalidateQueries({ queryKey: ["agenda-upcoming-home"] });
    },
    onSuccess: async () => {
      await Promise.all(
        ["agenda-upcoming-home", "activity-summary", "agenda", "activities"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      // Lo que cambia de lugar o sale de las listas se acomoda con una transición suave.
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    },
  });

  const localDay = (instant: string) =>
    timeZone ? utcToLocalDateTime(instant, timeZone).slice(0, 10) : "";
  const localTime = (instant: string) =>
    timeZone ? clockTime(utcToLocalDateTime(instant, timeZone).slice(11, 16)) : "";
  const withDeadline = (upcoming.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((item) => item.deadlineAt && item.status !== "cancelled")
    .sort((a, b) => (a.deadlineAt ?? "").localeCompare(b.deadlineAt ?? ""));
  const todayTasks = withDeadline.filter((item) => localDay(item.deadlineAt ?? "") === day);
  // Lo de hoy ya está en "Tareas de hoy": aquí solo lo de los días siguientes.
  const nextDeliveries = withDeadline
    .filter((item) => item.status !== "completed" && localDay(item.deadlineAt ?? "") !== day)
    .slice(0, 6);

  // El color sale del tipo de actividad (académica, personal o cotidiana).
  const categoryOf = (kind: Activity["kind"]) => categories[kindColor(kind)];

  const counts = summary.data;
  // Los tres tipos siempre (académica, personal, cotidiana); sin tareas, su anillo queda vacío.
  const ringRows =
    counts?.categories.map((row) => ({
      label: categoryInfo[row.category].label,
      value: percent(row.completed, row.total),
      color: categories[categoryInfo[row.category].color],
    })) ?? [];

  return (
    <ScreenLayout
      tab="Home"
      top={
        <HomeHeader
          name={profile.data?.displayName.split(" ")[0] || "de nuevo"}
          dateLabel={day ? longDate(day) : ""}
        />
      }
    >
      {profile.isError && (
        <ErrorRetry message={userMessage(profile.error)} onRetry={() => void profile.refetch()} />
      )}
      {offline && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los datos guardados.
        </Text>
      )}
      <OfflineBanner />

      <View style={styles.section}>
        <SectionHeading title="Tu racha" />
        <StreakCard />
      </View>

      <View style={styles.section}>
        <SectionHeading
          title="Tu progreso"
          onMore={() => navigation.navigate("Progress", { direction: "right" })}
        />
        <View style={[styles.card, styles.ringsCard, { backgroundColor: theme.colors.surface }]}>
          {summary.isPending && <ActivityIndicator accessibilityLabel="Cargando resumen" />}
          {summary.isError && (
            <ErrorRetry
              message={userMessage(summary.error)}
              onRetry={() => void summary.refetch()}
            />
          )}
          {counts && (
            <>
              <ProgressRings
                size={150}
                stroke={12}
                rings={ringRows.map((row) => ({ progress: row.value / 100, color: row.color }))}
              />
              <View style={styles.legend}>
                {ringRows.map((row) => (
                  <View key={row.label} style={styles.legendRow}>
                    <View style={[styles.dot, { backgroundColor: row.color }]} />
                    <Text variant="bodyLarge" numberOfLines={1} style={styles.legendLabel}>
                      {row.label}
                    </Text>
                    <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                      {row.value}%
                    </Text>
                  </View>
                ))}
                {counts.overdue > 0 && (
                  <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                    {counts.overdue} {counts.overdue === 1 ? "atrasada" : "atrasadas"}
                  </Text>
                )}
              </View>
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading
          title="Próximas entregas"
          onMore={() => navigation.navigate("Activities")}
        />
        {upcoming.isPending && !!day && (
          <ActivityIndicator accessibilityLabel="Cargando entregas" />
        )}
        {upcoming.isError && (
          <ErrorRetry
            message={userMessage(upcoming.error)}
            onRetry={() => void upcoming.refetch()}
          />
        )}
        {upcoming.isSuccess && nextDeliveries.length === 0 && (
          <EmptyState
            variant="centered"
            icon="calendar-check-outline"
            message="Nada por entregar en los próximos días."
          />
        )}
        {nextDeliveries.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.deliveryRow}
          >
            {nextDeliveries.map((item) => {
              const deliveryDay = localDay(item.deadlineAt ?? "");
              const isToday = deliveryDay === day;
              return (
                <TouchableRipple
                  borderless
                  key={item.id}
                  onPress={() => navigation.navigate("ActivityForm", { id: item.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir ${item.title}`}
                  style={[styles.card, styles.delivery, { backgroundColor: theme.colors.surface }]}
                >
                  <View style={styles.deliveryContent}>
                    <PieIcon progress={item.progressPercent / 100} color={categoryOf(item.kind)} />
                    <View style={styles.deliveryCopy}>
                      <Text
                        variant="labelMedium"
                        numberOfLines={1}
                        style={[styles.overline, { color: theme.colors.onSurfaceVariant }]}
                      >
                        {kindLabel(item.kind).toLocaleUpperCase("es")}
                      </Text>
                      <Text variant="titleMedium" numberOfLines={2} style={styles.bold}>
                        {item.title}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.dayChip,
                        {
                          backgroundColor: isToday
                            ? theme.colors.errorContainer
                            : theme.colors.primaryContainer,
                        },
                      ]}
                    >
                      <Text
                        variant="labelLarge"
                        style={[
                          styles.bold,
                          { color: isToday ? theme.colors.error : theme.colors.primary },
                        ]}
                      >
                        {isToday ? "HOY" : shortWeekday(deliveryDay).toLocaleUpperCase("es")}
                      </Text>
                    </View>
                  </View>
                </TouchableRipple>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeading title="Tareas de hoy" onMore={() => navigation.navigate("Agenda")} />
        {upcoming.isSuccess && todayTasks.length === 0 && (
          <EmptyState
            variant="centered"
            icon="checkbox-marked-circle-outline"
            message="No tienes entregas hoy. Aprovecha para avanzar a tu ritmo."
          />
        )}
        {todayTasks.map((item) => {
          const done = item.status === "completed";
          return (
            <View key={item.id} style={[styles.taskRow, { backgroundColor: theme.colors.surface }]}>
              <TouchableRipple
                borderless
                disabled={toggle.isPending}
                onPress={() => toggle.mutate(item)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={done ? `Reabrir ${item.title}` : `Completar ${item.title}`}
                style={styles.check}
              >
                <CheckCircle done={done} />
              </TouchableRipple>
              <TouchableRipple
                onPress={() => navigation.navigate("ActivityForm", { id: item.id })}
                accessibilityRole="button"
                accessibilityLabel={`Abrir ${item.title}`}
                style={styles.taskBody}
              >
                <View style={styles.taskContent}>
                  <Text
                    variant="bodyLarge"
                    numberOfLines={1}
                    style={[
                      styles.taskTitle,
                      done && {
                        textDecorationLine: "line-through",
                        color: theme.colors.onSurfaceVariant,
                      },
                    ]}
                  >
                    {item.title}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {localTime(item.deadlineAt ?? "")}
                  </Text>
                </View>
              </TouchableRipple>
            </View>
          );
        })}
      </View>
    </ScreenLayout>
  );
}

/** Círculo de completar: al marcarse, el check aparece con un «pop». */
function CheckCircle({ done }: { done: boolean }) {
  const theme = useTheme();
  const pop = useBounce(done);
  return (
    <Animated.View
      style={[
        styles.checkCircle,
        { transform: [{ scale: pop }] },
        done
          ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
          : { borderColor: theme.colors.outline },
      ]}
    >
      {done && <Icon source="check" size={16} color={theme.colors.onPrimary} />}
    </Animated.View>
  );
}

function SectionHeading({ title, onMore }: { title: string; onMore?: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeading}>
      <Text variant="titleLarge" style={styles.sectionTitle}>
        {title}
      </Text>
      {onMore && (
        <TouchableRipple
          borderless
          onPress={onMore}
          accessibilityRole="button"
          accessibilityLabel={`Ver todas: ${title}`}
          style={styles.more}
        >
          <View style={styles.moreContent}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              Ver todas
            </Text>
            <Icon source="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
          </View>
        </TouchableRipple>
      )}
    </View>
  );
}

function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.message}>
      <Text accessibilityRole="alert">{message}</Text>
      <Button onPress={onRetry}>Reintentar</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: layout.cardRadius },
  ringsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    padding: 20,
    minHeight: 190,
  },
  legend: { flex: 1, gap: 14 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendLabel: { flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  message: { gap: layout.itemGap },
  bold: { fontWeight: "600" },
  section: { gap: 12 },
  sectionTitle: { fontWeight: "700" },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  more: { borderRadius: layout.smallRadius, paddingVertical: 6, paddingLeft: 8 },
  moreContent: { flexDirection: "row", alignItems: "center", gap: 2 },
  deliveryRow: { gap: 12, paddingBottom: 4 },
  delivery: { width: 168, overflow: "hidden" },
  deliveryContent: { padding: 16, gap: 12, minHeight: 190, justifyContent: "space-between" },
  deliveryCopy: { gap: 4 },
  overline: { letterSpacing: 0.6 },
  dayChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 6,
    justifyContent: "center",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: layout.cardRadius,
    minHeight: 60,
    paddingLeft: 8,
    overflow: "hidden",
  },
  check: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  taskBody: { flex: 1, alignSelf: "stretch", justifyContent: "center" },
  taskContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 18,
    paddingLeft: 8,
  },
  taskTitle: { flex: 1 },
});
