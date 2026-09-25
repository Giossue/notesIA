import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Text, useTheme } from "react-native-paper";
import { listActivitySeries } from "@/core/api/activity-series";
import { layout } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { ScreenLayout } from "@/shared/ScreenLayout";

export function ActivitySeriesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const series = useInfiniteQuery({
    queryKey: ["activity-series"],
    queryFn: ({ pageParam }) => listActivitySeries(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const items = series.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ScreenLayout>
      <Button icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver">
        Volver
      </Button>
      <Text variant="headlineMedium">Actividades recurrentes</Text>
      <Text>
        Al crear una serie se generan sus instancias; las anteriores no cambian de forma silenciosa.
      </Text>
      <Button
        mode="contained"
        icon="plus"
        disabled={offline}
        onPress={() => navigation.navigate("ActivitySeriesForm")}
      >
        Nueva serie
      </Button>
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran datos guardados en esta sesión.
        </Text>
      )}
      {series.isPending && !offline && <ActivityIndicator accessibilityLabel="Cargando series" />}
      {series.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{series.error.message}</Text>
          <Button onPress={() => void series.refetch()}>Reintentar</Button>
        </View>
      )}
      {!series.isPending && !series.isError && items.length === 0 && (
        <EmptyState message="Aún no has creado actividades recurrentes." />
      )}
      {items.map((item) => (
        <Card key={item.id} mode="contained">
          <Card.Content style={styles.group}>
            <Text variant="titleMedium">{item.title}</Text>
            <Text>
              {item.frequency === "daily" ? "Diaria" : "Semanal"} · {item.startOn} a{" "}
              {item.throughOn}
            </Text>
            <Text>
              {item.instanceCount} instancias · {item.estimatedMinutes} min cada una
            </Text>
          </Card.Content>
        </Card>
      ))}
      {series.hasNextPage && (
        <Button
          mode="outlined"
          disabled={offline}
          loading={series.isFetchingNextPage}
          onPress={() => void series.fetchNextPage()}
        >
          Cargar más
        </Button>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
