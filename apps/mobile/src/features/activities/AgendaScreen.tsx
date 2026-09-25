import {
  type CalendarRangeView,
  calendarRangeForDate,
  shiftLocalDate,
  todayInTimeZone,
  utcToLocalDateTime,
} from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  SegmentedButtons,
  Text,
  useTheme,
} from "react-native-paper";
import { listActivities } from "@/core/api/activities";
import { listCalendarEvents } from "@/core/api/calendar-events";
import { getActivePlan } from "@/core/api/plans";
import { getProfile } from "@/core/api/profile";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { ScreenLayout } from "@/shared/ScreenLayout";

const viewLabels: Record<CalendarRangeView, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
};

export function AgendaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [view, setView] = useState<CalendarRangeView>("day");
  const [periodOffset, setPeriodOffset] = useState(0);
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const today = profile.data
    ? todayInTimeZone(new Date().toISOString(), profile.data.timeZone)
    : null;
  const range = today ? calendarRangeForDate(today, view, periodOffset) : null;
  const deadlines = useInfiniteQuery({
    queryKey: ["agenda", view, range?.from, range?.through],
    queryFn: ({ pageParam }) =>
      listActivities({
        dueFrom: range?.from,
        dueThrough: range?.through,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!range,
    retry: false,
  });
  const events = useInfiniteQuery({
    queryKey: ["agenda-events", view, range?.from, range?.through],
    queryFn: ({ pageParam }) =>
      listCalendarEvents({ from: range?.from, through: range?.through, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!range,
    retry: false,
  });
  const upcoming = useInfiniteQuery({
    queryKey: ["agenda-upcoming", range?.through],
    queryFn: ({ pageParam }) =>
      listActivities({
        dueFrom: range?.through,
        dueThrough: range ? shiftLocalDate(range.through, 7) : undefined,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: view === "day" && !!range,
    retry: false,
  });
  const activePlan = useQuery({ queryKey: ["active-plan"], queryFn: getActivePlan, retry: false });
  const deadlineItems = deadlines.data?.pages.flatMap((page) => page.items) ?? [];
  const eventItems = events.data?.pages.flatMap((page) => page.items) ?? [];
  const upcomingItems =
    upcoming.data?.pages
      .flatMap((page) => page.items)
      .filter((item) => item.status !== "completed" && item.status !== "cancelled") ?? [];
  const blockItems =
    activePlan.data?.blocks.filter((block) => {
      if (!range || !profile.data) return false;
      const localDay = utcToLocalDateTime(block.startsAt, profile.data.timeZone).slice(0, 10);
      return localDay >= range.from && localDay < range.through;
    }) ?? [];
  const summary = useMemo(() => {
    if (view !== "month" || !profile.data) return [];
    const rows = new Map<string, { events: number; deadlines: number; blocks: number }>();
    const row = (day: string) => {
      const current = rows.get(day) ?? { events: 0, deadlines: 0, blocks: 0 };
      rows.set(day, current);
      return current;
    };
    for (const item of eventItems)
      row(utcToLocalDateTime(item.startsAt, profile.data.timeZone).slice(0, 10)).events += 1;
    for (const item of deadlineItems) {
      if (item.deadlineAt)
        row(utcToLocalDateTime(item.deadlineAt, profile.data.timeZone).slice(0, 10)).deadlines += 1;
    }
    for (const item of blockItems)
      row(utcToLocalDateTime(item.startsAt, profile.data.timeZone).slice(0, 10)).blocks += 1;
    return [...rows.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [blockItems, deadlineItems, eventItems, profile.data, view]);

  const setAgendaView = (value: string) => {
    setView(value as CalendarRangeView);
    setPeriodOffset(0);
  };
  const rangeLabel = range
    ? view === "day"
      ? range.from
      : view === "month"
        ? range.from.slice(0, 7)
        : `${range.from} a ${shiftLocalDate(range.through, -1)}`
    : "";

  return (
    <ScreenLayout tab="Agenda">
      <Text variant="headlineMedium">Agenda</Text>
      <Text variant="bodyMedium">Eventos, fechas límite y bloques de trabajo del plan activo.</Text>
      <SegmentedButtons
        value={view}
        onValueChange={setAgendaView}
        buttons={(Object.keys(viewLabels) as CalendarRangeView[]).map((value) => ({
          value,
          label: viewLabels[value],
        }))}
      />
      {profile.isPending && <ActivityIndicator accessibilityLabel="Cargando zona horaria" />}
      {profile.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{profile.error.message}</Text>
          <Button onPress={() => void profile.refetch()}>Reintentar</Button>
        </View>
      )}
      {range && (
        <>
          <View style={styles.periodPicker}>
            <Button
              onPress={() => setPeriodOffset((value) => value - 1)}
              accessibilityLabel={`${viewLabels[view]} anterior`}
            >
              Anterior
            </Button>
            <Text variant="titleMedium">{rangeLabel}</Text>
            <Button
              onPress={() => setPeriodOffset((value) => value + 1)}
              accessibilityLabel={`${viewLabels[view]} siguiente`}
            >
              Siguiente
            </Button>
          </View>
          {periodOffset !== 0 && <Button onPress={() => setPeriodOffset(0)}>Volver a hoy</Button>}
        </>
      )}
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los datos guardados en esta sesión.
        </Text>
      )}

      {view === "month" && (
        <View style={styles.message}>
          <Text variant="titleLarge">Resumen mensual</Text>
          {summary.length === 0 && !deadlines.isPending && !events.isPending ? (
            <EmptyState message="No hay compromisos en este mes." />
          ) : (
            summary.map(([day, counts]) => (
              <Card key={day} mode="outlined">
                <Card.Content style={sharedStyles.listItem}>
                  <Text variant="titleSmall">{day}</Text>
                  <Text>
                    {counts.events} eventos · {counts.deadlines} fechas límite · {counts.blocks}{" "}
                    bloques
                  </Text>
                </Card.Content>
              </Card>
            ))
          )}
        </View>
      )}

      <View style={styles.sectionHeading}>
        <Text variant="titleLarge">Eventos fijos</Text>
        <Button mode="outlined" onPress={() => navigation.navigate("Events")}>
          Mis eventos
        </Button>
      </View>
      {range && events.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando eventos" />
      )}
      {events.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{events.error.message}</Text>
          <Button onPress={() => void events.refetch()}>Reintentar eventos</Button>
        </View>
      )}
      {range && !events.isPending && !events.isError && eventItems.length === 0 && (
        <EmptyState message="No hay eventos fijos en este periodo." />
      )}
      {eventItems.map((item) => (
        <Card
          key={item.id}
          mode="contained"
          onPress={() => navigation.navigate("EventForm", { id: item.id })}
          accessibilityLabel={`Abrir evento ${item.title}`}
        >
          <Card.Content style={sharedStyles.listItem}>
            <Text variant="titleMedium">{item.title}</Text>
            {profile.data && (
              <Text variant="bodyMedium">
                {utcToLocalDateTime(item.startsAt, profile.data.timeZone).replace("T", " ")}
                {" → "}
                {utcToLocalDateTime(item.endsAt, profile.data.timeZone).replace("T", " ")}
              </Text>
            )}
          </Card.Content>
        </Card>
      ))}
      {events.hasNextPage && (
        <Button
          mode="outlined"
          loading={events.isFetchingNextPage}
          disabled={offline || events.isFetchingNextPage}
          onPress={() => void events.fetchNextPage()}
          contentStyle={sharedStyles.actionContent}
        >
          Cargar más eventos
        </Button>
      )}

      <Text variant="titleLarge">Fechas límite</Text>
      {range && deadlines.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando fechas límite" />
      )}
      {deadlines.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{deadlines.error.message}</Text>
          <Button onPress={() => void deadlines.refetch()}>Reintentar</Button>
        </View>
      )}
      {range && !deadlines.isPending && !deadlines.isError && deadlineItems.length === 0 && (
        <EmptyState message="No hay fechas límite en este periodo." />
      )}
      {deadlineItems.map((item) => (
        <Card
          key={item.id}
          mode="contained"
          onPress={() => navigation.navigate("ActivityForm", { id: item.id })}
          accessibilityLabel={`Abrir actividad ${item.title}`}
        >
          <Card.Content style={sharedStyles.listItem}>
            <Text variant="titleMedium">{item.title}</Text>
            {item.deadlineAt && profile.data && (
              <Text variant="bodyMedium">
                Fecha límite:{" "}
                {utcToLocalDateTime(item.deadlineAt, profile.data.timeZone).replace("T", " ")}
              </Text>
            )}
            <Text variant="bodySmall">
              {item.status === "completed" ? "Completada" : "Pendiente"}
            </Text>
          </Card.Content>
        </Card>
      ))}
      {deadlines.hasNextPage && (
        <Button
          mode="outlined"
          loading={deadlines.isFetchingNextPage}
          disabled={offline || deadlines.isFetchingNextPage}
          onPress={() => void deadlines.fetchNextPage()}
          contentStyle={sharedStyles.actionContent}
        >
          Cargar más fechas límite
        </Button>
      )}

      <Text variant="titleLarge">Bloques de trabajo</Text>
      {activePlan.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando plan activo" />
      )}
      {activePlan.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{activePlan.error.message}</Text>
          <Button onPress={() => void activePlan.refetch()}>Reintentar plan</Button>
        </View>
      )}
      {!activePlan.isPending && !activePlan.isError && blockItems.length === 0 && (
        <EmptyState message="No hay bloques del plan activo en este periodo." />
      )}
      {blockItems.map((block) => (
        <Card
          key={block.id}
          mode="outlined"
          onPress={() => navigation.navigate("ActivityForm", { id: block.activityId })}
          accessibilityLabel="Abrir actividad del bloque de trabajo"
        >
          <Card.Content style={sharedStyles.listItem}>
            <Text variant="titleMedium">Bloque de trabajo</Text>
            {profile.data && (
              <Text>
                {utcToLocalDateTime(block.startsAt, profile.data.timeZone).replace("T", " ")}
                {" → "}
                {utcToLocalDateTime(block.endsAt, profile.data.timeZone).replace("T", " ")}
              </Text>
            )}
            <Text variant="bodySmall">{block.isLocked ? "Bloqueado" : "Movible"}</Text>
          </Card.Content>
        </Card>
      ))}

      {view === "day" && (
        <View style={styles.message}>
          <Text variant="titleLarge">Próximas actividades</Text>
          <Text variant="bodySmall">Fechas límite de los próximos siete días.</Text>
          {upcoming.isPending && !offline && (
            <ActivityIndicator accessibilityLabel="Cargando próximas actividades" />
          )}
          {upcoming.isError && <Text accessibilityRole="alert">{upcoming.error.message}</Text>}
          {!upcoming.isPending && !upcoming.isError && upcomingItems.length === 0 && (
            <EmptyState message="No hay actividades próximas." />
          )}
          {upcomingItems.map((item) => (
            <Card
              key={item.id}
              mode="outlined"
              onPress={() => navigation.navigate("ActivityForm", { id: item.id })}
            >
              <Card.Content style={sharedStyles.listItem}>
                <Text variant="titleMedium">{item.title}</Text>
                {item.deadlineAt && profile.data && (
                  <Text>
                    {utcToLocalDateTime(item.deadlineAt, profile.data.timeZone).replace("T", " ")}
                  </Text>
                )}
              </Card.Content>
            </Card>
          ))}
          {upcoming.hasNextPage && (
            <Button
              mode="outlined"
              loading={upcoming.isFetchingNextPage}
              disabled={offline || upcoming.isFetchingNextPage}
              onPress={() => void upcoming.fetchNextPage()}
            >
              Cargar más próximas
            </Button>
          )}
        </View>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  periodPicker: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  message: { gap: layout.itemGap },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
