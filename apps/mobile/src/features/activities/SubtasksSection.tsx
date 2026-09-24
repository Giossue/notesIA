import type { Activity } from "@notesia/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { ActivityIndicator, Button, SegmentedButtons, Text, useTheme } from "react-native-paper";
import { listSubtasks } from "@/core/api/subtasks";
import { layout, sharedStyles } from "@/core/theme/layout";
import { SubtaskEditor } from "./SubtaskEditor";
import { SubtaskItem } from "./SubtaskItem";

export function SubtasksSection({ activity, offline }: { activity: Activity; offline: boolean }) {
  const theme = useTheme();
  const [archived, setArchived] = useState(false);
  const subtasks = useInfiniteQuery({
    queryKey: ["subtasks", activity.id, archived],
    queryFn: ({ pageParam }) => listSubtasks(activity.id, archived, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !offline,
    retry: false,
  });
  const items = subtasks.data?.pages.flatMap((page) => page.items) ?? [];
  const disabled = offline || !!activity.archivedAt;

  return (
    <View style={{ gap: layout.sectionGap, paddingTop: layout.sectionGap }}>
      <Text variant="titleLarge">Subtareas</Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Divide la actividad en pasos. Su finalización no cambia automáticamente el estado de la
        actividad.
      </Text>
      <SegmentedButtons
        value={archived ? "archived" : "active"}
        onValueChange={(value) => setArchived(value === "archived")}
        buttons={[
          { value: "active", label: "Activas" },
          { value: "archived", label: "Archivo" },
        ]}
      />
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los datos guardados en esta sesión.
        </Text>
      )}
      {activity.archivedAt && (
        <Text style={{ color: theme.colors.onSurfaceVariant }}>
          Restaura la actividad para modificar sus subtareas.
        </Text>
      )}
      {!archived && !activity.archivedAt && (
        <SubtaskEditor activityId={activity.id} disabled={disabled} />
      )}
      {subtasks.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando subtareas" />
      )}
      {subtasks.isError && (
        <View style={{ gap: layout.itemGap }}>
          <Text accessibilityRole="alert">{subtasks.error.message}</Text>
          <Button onPress={() => void subtasks.refetch()}>Reintentar subtareas</Button>
        </View>
      )}
      {!subtasks.isPending && !subtasks.isError && items.length === 0 && (
        <Text>{archived ? "No hay subtareas archivadas." : "Aún no hay subtareas."}</Text>
      )}
      {items.map((item) => (
        <SubtaskItem key={item.id} subtask={item} disabled={disabled} />
      ))}
      {subtasks.hasNextPage && (
        <Button
          mode="outlined"
          loading={subtasks.isFetchingNextPage}
          disabled={offline || subtasks.isFetchingNextPage}
          onPress={() => void subtasks.fetchNextPage()}
          contentStyle={sharedStyles.actionContent}
        >
          Cargar más subtareas
        </Button>
      )}
    </View>
  );
}
