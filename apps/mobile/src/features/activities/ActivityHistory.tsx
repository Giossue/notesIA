import { useNetInfo } from "@react-native-community/netinfo";
import { useInfiniteQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { listActivityHistory } from "@/core/api/activities";
import { layout } from "@/core/theme/layout";

export function ActivityHistory({ id }: { id: string }) {
  const offline = useNetInfo().isConnected === false;
  const history = useInfiniteQuery({
    queryKey: ["activity-history", id],
    queryFn: ({ pageParam }) => listActivityHistory(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !offline,
    retry: false,
  });
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={{ gap: layout.itemGap, paddingTop: layout.sectionGap }}>
      <Text variant="titleMedium">Historial</Text>
      {history.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando historial" />
      )}
      {history.isError && (
        <>
          <Text accessibilityRole="alert">{history.error.message}</Text>
          <Button onPress={() => void history.refetch()}>Reintentar historial</Button>
        </>
      )}
      {!history.isPending && !history.isError && items.length === 0 && (
        <Text>Aún no hay cambios de finalización.</Text>
      )}
      {items.map((item) => (
        <Text key={item.id}>
          {item.eventType === "completed" ? "Completada" : "Reabierta"} ·{" "}
          {item.createdAt.slice(0, 16).replace("T", " ")} UTC
        </Text>
      ))}
      {history.hasNextPage && (
        <Button
          disabled={offline || history.isFetchingNextPage}
          loading={history.isFetchingNextPage}
          onPress={() => void history.fetchNextPage()}
        >
          Cargar más historial
        </Button>
      )}
    </View>
  );
}
