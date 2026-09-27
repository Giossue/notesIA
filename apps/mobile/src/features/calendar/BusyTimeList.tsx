import { shiftLocalDate, todayInTimeZone, utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { listCalendarEvents } from "@/core/api/calendar-events";
import { getProfile } from "@/core/api/profile";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";

const kindLabels = {
  class: "Clase",
  work: "Trabajo",
  appointment: "Cita",
  personal: "Personal",
  unavailable: "No disponible",
  other: "Otro",
};

/** Horas ocupadas que el planificador resta de la franja de estudio. */
export function BusyTimeList() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const today = profile.data
    ? todayInTimeZone(new Date().toISOString(), profile.data.timeZone)
    : null;
  const through = today ? shiftLocalDate(today, 30) : null;
  const events = useInfiniteQuery({
    queryKey: ["calendar-events", "upcoming", today, through],
    queryFn: ({ pageParam }) =>
      listCalendarEvents({
        from: today ?? undefined,
        through: through ?? undefined,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!today,
    retry: false,
  });
  const items = events.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los datos guardados en esta sesión.
        </Text>
      )}
      {(profile.isPending || (today && events.isPending)) && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando horas ocupadas" />
      )}
      {profile.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(profile.error)}</Text>
          <Button onPress={() => void profile.refetch()}>Reintentar perfil</Button>
        </View>
      )}
      {events.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(events.error)}</Text>
          <Button onPress={() => void events.refetch()}>Reintentar</Button>
        </View>
      )}
      {!profile.isPending &&
        !profile.isError &&
        !events.isPending &&
        !events.isError &&
        items.length === 0 && (
          <EmptyState
            variant="centered"
            icon="calendar-lock-outline"
            message="No hay horas ocupadas en los próximos 30 días."
          />
        )}
      {items.map((item) => (
        <Card
          key={item.id}
          mode="contained"
          onPress={() => navigation.navigate("EventForm", { id: item.id })}
          accessibilityLabel={`Abrir hora ocupada ${item.title}`}
        >
          <Card.Content style={sharedStyles.listItem}>
            <Text variant="titleMedium">{item.title}</Text>
            {item.kind !== "unavailable" && item.kind !== "other" && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {kindLabels[item.kind]}
              </Text>
            )}
            <Text variant="bodyMedium">{when(item.startsAt, item.endsAt, item.timeZone)}</Text>
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
          Cargar más
        </Button>
      )}
    </>
  );
}

/** "lun 28 sep · 07:00 – 09:00" en la hora del bloque ocupado. */
function when(startsAt: string, endsAt: string, timeZone: string) {
  const start = utcToLocalDateTime(startsAt, timeZone);
  const end = utcToLocalDateTime(endsAt, timeZone);
  const day = new Date(startsAt)
    .toLocaleDateString("es", { timeZone, weekday: "short", day: "numeric", month: "short" })
    .replaceAll(".", "");
  const endDay = start.slice(0, 10) === end.slice(0, 10) ? "" : " del día siguiente";
  return `${day} · ${start.slice(11, 16)} – ${end.slice(11, 16)}${endDay}`;
}

const styles = StyleSheet.create({
  message: { gap: layout.itemGap },
});
