import { shiftLocalDate, todayInTimeZone, utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Text, useTheme } from "react-native-paper";
import { listActivities } from "@/core/api/activities";
import { listCalendarEvents } from "@/core/api/calendar-events";
import { getProfile } from "@/core/api/profile";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { ScreenLayout } from "@/shared/ScreenLayout";

export function AgendaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [dayOffset, setDayOffset] = useState(0);
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const day = profile.data
    ? shiftLocalDate(todayInTimeZone(new Date().toISOString(), profile.data.timeZone), dayOffset)
    : null;
  const deadlines = useInfiniteQuery({
    queryKey: ["agenda", day],
    queryFn: ({ pageParam }) => listActivities({ dueOn: day ?? undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!day && !offline,
    retry: false,
  });
  const events = useInfiniteQuery({
    queryKey: ["agenda-events", day],
    queryFn: ({ pageParam }) => listCalendarEvents({ on: day ?? undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!day && !offline,
    retry: false,
  });
  const deadlineItems = deadlines.data?.pages.flatMap((page) => page.items) ?? [];
  const eventItems = events.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <ScreenLayout tab="Agenda">
      <Text variant="headlineMedium">Agenda diaria</Text>
      <Text variant="bodyMedium">Compromisos fijos y actividades con fecha límite.</Text>
      {profile.isPending && <ActivityIndicator accessibilityLabel="Cargando zona horaria" />}
      {profile.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{profile.error.message}</Text>
          <Button onPress={() => void profile.refetch()}>Reintentar</Button>
        </View>
      )}
      {day && (
        <>
          <View style={styles.dayPicker}>
            <Button
              onPress={() => setDayOffset((value) => value - 1)}
              accessibilityLabel="Día anterior"
            >
              Anterior
            </Button>
            <Text variant="titleMedium">{day}</Text>
            <Button
              onPress={() => setDayOffset((value) => value + 1)}
              accessibilityLabel="Día siguiente"
            >
              Siguiente
            </Button>
          </View>
          {dayOffset !== 0 && <Button onPress={() => setDayOffset(0)}>Ir a hoy</Button>}
        </>
      )}
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los datos guardados en esta sesión.
        </Text>
      )}
      <View style={styles.sectionHeading}>
        <Text variant="titleLarge">Eventos fijos</Text>
        <Button mode="outlined" onPress={() => navigation.navigate("Events")}>
          Mis eventos
        </Button>
      </View>
      {day && events.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando eventos del día" />
      )}
      {events.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{events.error.message}</Text>
          <Button onPress={() => void events.refetch()}>Reintentar eventos</Button>
        </View>
      )}
      {day && !events.isPending && !events.isError && eventItems.length === 0 && (
        <EmptyState message="No hay eventos fijos para este día." />
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
      {day && deadlines.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando agenda" />
      )}
      {deadlines.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{deadlines.error.message}</Text>
          <Button onPress={() => void deadlines.refetch()}>Reintentar</Button>
        </View>
      )}
      {day && !deadlines.isPending && !deadlines.isError && deadlineItems.length === 0 && (
        <EmptyState message="No hay fechas límite para este día." />
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
                Fecha límite: {utcToLocalDateTime(item.deadlineAt, profile.data.timeZone).slice(11)}
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
          Cargar más
        </Button>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  dayPicker: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  message: { gap: layout.itemGap },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
