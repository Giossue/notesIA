import type { CalendarEvent } from "@notesia/contracts";
import {
  calendarRangeForDate,
  shiftLocalDate,
  todayInTimeZone,
  utcToLocalDateTime,
} from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple, useTheme } from "react-native-paper";
import Svg, { Circle } from "react-native-svg";
import { listActivities } from "@/core/api/activities";
import { listCalendarEvents } from "@/core/api/calendar-events";
import { getActivePlan } from "@/core/api/plans";
import { getProfile } from "@/core/api/profile";
import { layout } from "@/core/theme/layout";
import { type CategoryColor, categoryColors } from "@/core/theme/theme";
import type { RootStackParamList } from "@/navigation/types";
import { kindColor } from "@/shared/activity-kinds";
import { agendaInfo } from "@/shared/concepts";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { shortWeekday } from "@/shared/format";
import { Button } from "@/shared/paper";
import { HeaderButton } from "@/shared/ScreenHeader";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { type AgendaEntry, DayAgendaList } from "./DayAgendaList";

const eventKinds: Record<
  CalendarEvent["kind"],
  { label: string; color: CategoryColor; icon: string }
> = {
  class: { label: "Clase", color: "blue", icon: "school-outline" },
  work: { label: "Trabajo", color: "orange", icon: "briefcase-outline" },
  appointment: { label: "Cita", color: "cyan", icon: "account-clock-outline" },
  personal: { label: "Personal", color: "pink", icon: "heart-outline" },
  unavailable: { label: "No disponible", color: "gray", icon: "cancel" },
  other: { label: "Otro", color: "gray", icon: "dots-horizontal" },
};

const monthNames = [
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

type TimelineItem = {
  key: string;
  startsAt: string;
  endsAt: string | null;
  time: string;
  label: string;
  color: CategoryColor;
  title: string;
  meta: string;
  metaIcon: string;
  open: () => void;
};

export function AgendaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const categories = categoryColors[theme.dark ? "dark" : "light"];
  const offline = useNetInfo().isConnected === false;
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  // Reloj para la línea de la hora actual; se actualiza cada minuto.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const timeZone = profile.data?.timeZone;
  const today = timeZone ? todayInTimeZone(new Date().toISOString(), timeZone) : null;
  const week = today ? calendarRangeForDate(today, "week", weekOffset) : null;
  const weekDays = week
    ? Array.from({ length: 7 }, (_, index) => shiftLocalDate(week.from, index))
    : [];
  const selectedDay =
    selected && weekDays.includes(selected)
      ? selected
      : today && weekDays.includes(today)
        ? today
        : (weekDays[0] ?? null);

  const deadlines = useInfiniteQuery({
    queryKey: ["agenda", "week", week?.from, week?.through],
    queryFn: ({ pageParam }) =>
      listActivities({ dueFrom: week?.from, dueThrough: week?.through, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!week,
    retry: false,
  });
  const events = useInfiniteQuery({
    queryKey: ["agenda-events", "week", week?.from, week?.through],
    queryFn: ({ pageParam }) =>
      listCalendarEvents({ from: week?.from, through: week?.through, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!week,
    retry: false,
  });
  const activePlan = useQuery({ queryKey: ["active-plan"], queryFn: getActivePlan, retry: false });
  const local = (instant: string) => (timeZone ? utcToLocalDateTime(instant, timeZone) : "");
  const hhmm = (instant: string) => local(instant).slice(11, 16);
  const deadlineItems = deadlines.data?.pages.flatMap((page) => page.items) ?? [];
  const eventItems = events.data?.pages.flatMap((page) => page.items) ?? [];
  const activityTitles = new Map(deadlineItems.map((item) => [item.id, item.title]));

  const items: TimelineItem[] = [
    ...eventItems.map((item) => {
      const kind = eventKinds[item.kind];
      return {
        key: `event-${item.id}`,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        time: hhmm(item.startsAt),
        label: kind.label,
        color: kind.color,
        title: item.title,
        meta: item.description?.trim() || "Compromiso",
        metaIcon: kind.icon,
        open: () => navigation.navigate("EventForm", { id: item.id }),
      };
    }),
    ...deadlineItems.flatMap((item) => {
      if (!item.deadlineAt || item.status === "cancelled") return [];
      return [
        {
          key: `deadline-${item.id}`,
          startsAt: item.deadlineAt,
          endsAt: null,
          time: hhmm(item.deadlineAt),
          label: "Entrega",
          color: kindColor(item.kind),
          title: item.title,
          meta: item.status === "completed" ? "Completada" : `${item.progressPercent}% de avance`,
          metaIcon: item.status === "completed" ? "check-circle-outline" : "file-document-outline",
          open: () => navigation.navigate("ActivityForm", { id: item.id }),
        },
      ];
    }),
    ...(activePlan.data?.blocks ?? []).map((block) => ({
      key: `block-${block.id}`,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      time: hhmm(block.startsAt),
      label: "Estudio",
      color: "cyan" as const,
      title: activityTitles.get(block.activityId) ?? "Bloque de estudio",
      meta: block.isLocked ? "Bloque fijo del plan" : "Bloque del plan",
      metaIcon: "timer-outline",
      open: () => navigation.navigate("ActivityForm", { id: block.activityId }),
    })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const busyDays = new Set(items.map((item) => local(item.startsAt).slice(0, 10)));
  const dayItems = items.filter((item) => local(item.startsAt).slice(0, 10) === selectedDay);
  const loading = !!week && (events.isPending || deadlines.isPending) && !offline;
  const monthLabel = selectedDay
    ? `${monthNames[Number(selectedDay.slice(5, 7)) - 1]} ${selectedDay.slice(0, 4)}`
    : "";

  // Minutos locales desde la medianoche del día elegido (lo que pasa a otro día se recorta).
  const minuteOf = (instant: string) => {
    const value = local(instant);
    if (value.slice(0, 10) > (selectedDay ?? "")) return 24 * 60;
    return Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
  };
  const entries: AgendaEntry[] = dayItems.map((item) => ({
    key: item.key,
    startMinute: minuteOf(item.startsAt),
    endMinute: item.endsAt ? minuteOf(item.endsAt) : null,
    label: item.label,
    color: categories[item.color],
    title: item.title,
    meta: item.meta,
    metaIcon: item.metaIcon,
    open: item.open,
  }));
  const nowLocal = timeZone ? utcToLocalDateTime(now.toISOString(), timeZone) : "";
  const nowMinute =
    selectedDay && nowLocal.slice(0, 10) === selectedDay
      ? Number(nowLocal.slice(11, 13)) * 60 + Number(nowLocal.slice(14, 16))
      : null;
  const failed = events.isError || deadlines.isError;

  const weekStrip = week ? (
    <View style={styles.weekBlock}>
      <View style={styles.weekHeader}>
        <HeaderButton
          icon="chevron-left"
          label="Semana anterior"
          onPress={() => setWeekOffset((value) => value - 1)}
        />
        <TouchableRipple
          borderless
          onPress={() => {
            setWeekOffset(0);
            setSelected(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Volver a hoy"
          style={styles.monthButton}
        >
          <Text variant="titleMedium" style={styles.bold}>
            {monthLabel}
          </Text>
        </TouchableRipple>
        <HeaderButton
          icon="chevron-right"
          label="Semana siguiente"
          onPress={() => setWeekOffset((value) => value + 1)}
        />
      </View>
      <View style={styles.strip}>
        {weekDays.map((date) => {
          const active = date === selectedDay;
          return (
            <TouchableRipple
              borderless
              key={date}
              onPress={() => setSelected(date)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${shortWeekday(date)} ${Number(date.slice(8))}`}
              style={[
                styles.day,
                // Pastillas del mismo tono que las tarjetas, sobre el fondo.
                { backgroundColor: active ? theme.colors.primary : theme.colors.surface },
              ]}
            >
              <View style={styles.dayContent}>
                <Text
                  variant="titleMedium"
                  style={[styles.bold, active && { color: theme.colors.onPrimary }]}
                >
                  {Number(date.slice(8))}
                </Text>
                <Text
                  variant="labelSmall"
                  style={{
                    color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
                  }}
                >
                  {shortWeekday(date)}
                </Text>
                {/* Círculo en SVG: con un View tan pequeño, Android lo dibujaba cuadrado. */}
                <Svg width={6} height={6} style={styles.busyDot}>
                  <Circle
                    cx={3}
                    cy={3}
                    r={3}
                    fill={
                      busyDays.has(date)
                        ? active
                          ? theme.colors.onPrimary
                          : theme.colors.primary
                        : "transparent"
                    }
                  />
                </Svg>
              </View>
            </TouchableRipple>
          );
        })}
      </View>
    </View>
  ) : null;

  return (
    <ScreenLayout
      fab={{ date: selectedDay ?? undefined }}
      header={{
        title: "Agenda",
        info: agendaInfo,
        right: {
          icon: "calendar-month-outline",
          label: "Ver mis compromisos",
          onPress: () => navigation.navigate("Events"),
        },
      }}
    >
      {profile.isError && (
        <ErrorRetry message={userMessage(profile.error)} onRetry={() => void profile.refetch()} />
      )}
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los datos guardados en esta sesión.
        </Text>
      )}

      {weekStrip}
      {week && (
        <View style={styles.card}>
          {loading && <ActivityIndicator accessibilityLabel="Cargando agenda" />}
          {events.isError && (
            <ErrorRetry message={userMessage(events.error)} onRetry={() => void events.refetch()} />
          )}
          {deadlines.isError && (
            <ErrorRetry
              message={userMessage(deadlines.error)}
              onRetry={() => void deadlines.refetch()}
            />
          )}
          {!loading && !failed && dayItems.length === 0 && (
            <EmptyState
              variant="centered"
              icon="calendar-blank-outline"
              message="Nada programado para este día."
            />
          )}

          {dayItems.length > 0 && <DayAgendaList entries={entries} nowMinute={nowMinute} />}
          {(events.hasNextPage || deadlines.hasNextPage) && (
            <Button
              mode="outlined"
              loading={events.isFetchingNextPage || deadlines.isFetchingNextPage}
              disabled={offline}
              onPress={() => {
                if (events.hasNextPage) void events.fetchNextPage();
                if (deadlines.hasNextPage) void deadlines.fetchNextPage();
              }}
            >
              Cargar más
            </Button>
          )}
        </View>
      )}
    </ScreenLayout>
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
  message: { gap: layout.itemGap },
  bold: { fontWeight: "700" },
  card: { gap: 16 },
  weekBlock: { gap: 12 },
  // Flechas junto al mes, lejos de las acciones del encabezado.
  weekHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  monthButton: { borderRadius: layout.smallRadius, paddingHorizontal: 12, paddingVertical: 6 },
  strip: { flexDirection: "row", gap: 6 },
  day: { flex: 1, borderRadius: 26 },
  dayContent: { alignItems: "center", paddingVertical: 8, gap: 1 },
  busyDot: { marginTop: 3 },
});
