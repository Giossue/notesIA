import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Divider, Text, useTheme } from "react-native-paper";
import { listTimeEntries } from "@/core/api/time-entries";
import { layout } from "@/core/theme/layout";
import { ActivityTitle } from "@/features/activities/ActivityTitle";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { ManualTimeForm } from "./ManualTimeForm";
import { TimerPanel } from "./TimerPanel";
import { TimeStatisticsPanel } from "./TimeStatisticsPanel";

export function TimeTrackingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const entries = useInfiniteQuery({
    queryKey: ["time-entries"],
    queryFn: ({ pageParam }) => listTimeEntries(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const items = entries.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ScreenLayout keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver">
        Volver
      </Button>
      <Text variant="headlineMedium">Tiempo de estudio</Text>
      <TimerPanel />
      <Divider />
      <ManualTimeForm />
      <Divider />
      <Text variant="titleMedium">Historial reciente</Text>
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran datos guardados en esta sesión.
        </Text>
      )}
      {entries.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando historial de tiempo" />
      )}
      {entries.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{entries.error.message}</Text>
          <Button onPress={() => void entries.refetch()}>Reintentar</Button>
        </View>
      )}
      {!entries.isPending && !entries.isError && items.length === 0 && (
        <EmptyState message="Aún no hay sesiones registradas." />
      )}
      {items.map((entry) => (
        <Card key={entry.id} mode="outlined">
          <Card.Content style={styles.group}>
            <ActivityTitle id={entry.activityId} />
            <Text>
              {entry.source === "timer" ? "Temporizador" : "Manual"} ·{" "}
              {entry.durationSeconds ? `${Math.round(entry.durationSeconds / 60)} min` : "en curso"}
            </Text>
            <Text variant="bodySmall">{new Date(entry.startsAt).toLocaleString()}</Text>
          </Card.Content>
        </Card>
      ))}
      {entries.hasNextPage && (
        <Button
          mode="outlined"
          disabled={offline}
          loading={entries.isFetchingNextPage}
          onPress={() => void entries.fetchNextPage()}
        >
          Cargar más
        </Button>
      )}
      <Divider />
      <TimeStatisticsPanel />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
