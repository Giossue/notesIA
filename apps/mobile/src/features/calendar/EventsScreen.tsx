import { utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { listCalendarEvents } from "@/core/api/calendar-events";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";

const kindLabels = {
  class: "Clase",
  work: "Trabajo",
  appointment: "Cita",
  personal: "Personal",
  unavailable: "No disponible",
  other: "Otro",
};

export function EventsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const events = useInfiniteQuery({
    queryKey: ["calendar-events", false],
    queryFn: ({ pageParam }) => listCalendarEvents({ archived: false, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const items = events.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <ScreenLayout
      header={{ title: "Mis compromisos" }}
      fab={{ label: "Nuevo compromiso", onPress: () => navigation.navigate("EventForm", {}) }}
    >
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Clases, trabajo y citas: las horas en que estás ocupado. Tu plan de estudio no se pone
        encima.
      </Text>
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los datos guardados en esta sesión.
        </Text>
      )}
      {events.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando compromisos" />
      )}
      {events.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(events.error)}</Text>
          <Button onPress={() => void events.refetch()}>Reintentar</Button>
        </View>
      )}
      {!events.isPending && !events.isError && items.length === 0 && (
        <EmptyState message="Aún no tienes compromisos." />
      )}
      {items.map((item) => (
        <Card
          key={item.id}
          mode="contained"
          onPress={() => navigation.navigate("EventForm", { id: item.id })}
          accessibilityLabel={`Abrir compromiso ${item.title}`}
        >
          <Card.Content style={sharedStyles.listItem}>
            <Text variant="titleMedium">{item.title}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {kindLabels[item.kind]} · {item.timeZone}
            </Text>
            <Text variant="bodyMedium">
              {utcToLocalDateTime(item.startsAt, item.timeZone).replace("T", " ")} →{" "}
              {utcToLocalDateTime(item.endsAt, item.timeZone).replace("T", " ")}
            </Text>
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
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  message: { gap: layout.itemGap },
});
