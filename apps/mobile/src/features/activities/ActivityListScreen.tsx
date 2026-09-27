import { utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { listActivities } from "@/core/api/activities";
import { getProfile } from "@/core/api/profile";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { kindLabel } from "@/shared/activity-kinds";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { FadeUp } from "@/shared/motion";
import { Button, Card } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";

const statusLabels = {
  backlog: "Pendiente",
  planned: "Planificada",
  in_progress: "En progreso",
  completed: "Completada",
  cancelled: "Cancelada",
};

export function ActivityListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [view, setView] = useState<"active" | "completed" | "archived">("active");
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: false,
  });
  const activities = useInfiniteQuery({
    queryKey: ["activities", view],
    queryFn: ({ pageParam }) =>
      listActivities({
        archived: view === "archived",
        status: view === "completed" ? "completed" : undefined,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const items = activities.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <ScreenLayout
      header={{ title: "Tareas" }}
      fab={{ label: "Nueva tarea", onPress: () => navigation.navigate("ActivityForm", {}) }}
    >
      <Tabs
        value={view}
        onValueChange={setView}
        buttons={[
          { value: "active", label: "Todas" },
          { value: "completed", label: "Hechas" },
          { value: "archived", label: "Archivo" },
        ]}
      />
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los datos guardados en esta sesión.
        </Text>
      )}
      {activities.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando tareas" />
      )}
      {activities.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(activities.error)}</Text>
          <Button onPress={() => void activities.refetch()}>Reintentar</Button>
        </View>
      )}
      {!activities.isPending && !activities.isError && items.length === 0 && (
        <EmptyState
          variant="centered"
          icon="checkbox-marked-circle-outline"
          message={
            view === "archived"
              ? "No tienes tareas archivadas."
              : view === "completed"
                ? "Aún no has completado tareas."
                : "Aún no tienes tareas. Crea la primera."
          }
        />
      )}
      {items.map((item, index) => (
        <FadeUp key={item.id} index={Math.min(index, 8)}>
          <Card
            mode="contained"
            onPress={() => navigation.navigate("ActivityForm", { id: item.id })}
            accessibilityLabel={`Abrir tarea ${item.title}`}
          >
            <Card.Content style={sharedStyles.listItem}>
              <Text variant="titleMedium">{item.title}</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {statusLabels[item.status]} · {kindLabel(item.kind)}
              </Text>
              {item.deadlineAt && profile.data && (
                <Text variant="bodySmall">
                  Fecha límite:{" "}
                  {utcToLocalDateTime(item.deadlineAt, profile.data.timeZone).replace("T", " ")}
                </Text>
              )}
            </Card.Content>
          </Card>
        </FadeUp>
      ))}
      {activities.hasNextPage && (
        <Button
          mode="outlined"
          loading={activities.isFetchingNextPage}
          disabled={offline || activities.isFetchingNextPage}
          onPress={() => void activities.fetchNextPage()}
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
