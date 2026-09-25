import { useNetInfo } from "@react-native-community/netinfo";
import { useInfiniteQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { listActivityHistory } from "@/core/api/activities";
import { layout } from "@/core/theme/layout";
import { userMessage } from "@/shared/errors";
import { Button } from "@/shared/paper";

const eventLabels = {
  completed: "Completada",
  reopened: "Reactivada",
  cancelled: "Cancelada",
  progress_updated: "Progreso actualizado",
  deleted: "Eliminada",
};

export function ActivityHistory({ id }: { id: string }) {
  const offline = useNetInfo().isConnected === false;
  const history = useInfiniteQuery({
    queryKey: ["activity-history", id],
    queryFn: ({ pageParam }) => listActivityHistory(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
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
          <Text accessibilityRole="alert">{userMessage(history.error)}</Text>
          <Button onPress={() => void history.refetch()}>Reintentar historial</Button>
        </>
      )}
      {!history.isPending && !history.isError && items.length === 0 && (
        <Text>Aún no hay cambios registrados.</Text>
      )}
      {items.map((item) => (
        <Text key={item.id}>
          {eventLabels[item.eventType]} · {item.createdAt.slice(0, 16).replace("T", " ")} UTC
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
