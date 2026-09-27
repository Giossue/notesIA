import type { Activity, Subtask } from "@notesia/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Checkbox, IconButton, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { OfflineQueuedError } from "@/core/api/api-error";
import {
  createSubtask,
  listSubtasks,
  setSubtaskArchived,
  updateSubtask,
} from "@/core/api/subtasks";
import { editCachedList, patchCached } from "@/core/offline/optimistic";
import { layout } from "@/core/theme/layout";
import { Button, TextInput } from "@/shared/paper";

/**
 * Subtareas como lista de checks: marcar, agregar y quitar. Los cambios se ven
 * al instante; sin conexión quedan en el teléfono y se envían después.
 */
export function SubtasksSection({ activity }: { activity: Activity }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const key = ["subtasks", activity.id, false];
  const [draft, setDraft] = useState("");
  const subtasks = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => listSubtasks(activity.id, false, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const items = subtasks.data?.pages.flatMap((page) => page.items) ?? [];
  const locked = !!activity.archivedAt;
  // Sin conexión el cambio ya se ve en pantalla; con conexión se recarga lo del servidor.
  const settle = (error: unknown) => {
    if (error && !(error instanceof OfflineQueuedError))
      void queryClient.invalidateQueries({ queryKey: ["subtasks", activity.id] });
    else if (!error) void queryClient.invalidateQueries({ queryKey: ["subtasks", activity.id] });
  };

  const add = useMutation({
    mutationFn: (title: string) => {
      const id = uuidv4();
      const now = new Date().toISOString();
      editCachedList<Subtask>(queryClient, key, (current) => [
        ...current,
        {
          id,
          activityId: activity.id,
          title,
          estimatedMinutes: null,
          isCompleted: false,
          completedAt: null,
          archivedAt: null,
          version: 1,
          createdAt: now,
          updatedAt: now,
        } as Subtask,
      ]);
      return createSubtask(activity.id, { id, title, estimatedMinutes: null });
    },
    onSettled: (_data, error) => settle(error),
  });
  const toggle = useMutation({
    mutationFn: (subtask: Subtask) => {
      // La versión avanza como en el servidor: un segundo cambio sin conexión no choca.
      patchCached<Subtask>(queryClient, [["subtasks", activity.id]], subtask.id, {
        isCompleted: !subtask.isCompleted,
        version: subtask.version + 1,
      });
      return updateSubtask(activity.id, subtask.id, {
        title: subtask.title,
        estimatedMinutes: subtask.estimatedMinutes,
        isCompleted: !subtask.isCompleted,
        version: subtask.version,
        mutationId: uuidv4(),
      });
    },
    onSettled: (_data, error) => settle(error),
  });
  const remove = useMutation({
    mutationFn: (subtask: Subtask) => {
      editCachedList<Subtask>(queryClient, key, (current) =>
        current.filter((item) => item.id !== subtask.id),
      );
      return setSubtaskArchived(activity.id, subtask.id, true, subtask.version, uuidv4());
    },
    onSettled: (_data, error) => settle(error),
  });

  const submit = () => {
    const title = draft.trim().slice(0, 240);
    if (!title) return;
    setDraft("");
    add.mutate(title);
  };
  const done = items.filter((item) => item.isCompleted).length;

  return (
    <View style={styles.section}>
      <Text variant="titleLarge" style={styles.bold}>
        Subtareas{items.length > 0 ? ` · ${done}/${items.length}` : ""}
      </Text>
      {subtasks.isPending && <ActivityIndicator accessibilityLabel="Cargando subtareas" />}
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <Checkbox.Android
            status={item.isCompleted ? "checked" : "unchecked"}
            disabled={locked}
            onPress={() => toggle.mutate(item)}
            accessibilityLabel={`${item.isCompleted ? "Desmarcar" : "Marcar"} ${item.title}`}
          />
          <Text
            style={[
              styles.title,
              item.isCompleted && {
                textDecorationLine: "line-through",
                color: theme.colors.onSurfaceVariant,
              },
            ]}
          >
            {item.title}
          </Text>
          {!locked && (
            <IconButton
              icon="close"
              size={18}
              accessibilityLabel={`Quitar ${item.title}`}
              onPress={() => remove.mutate(item)}
            />
          )}
        </View>
      ))}
      {!subtasks.isPending && items.length === 0 && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Divide la tarea en pasos más chicos y márcalos a medida que avanzas.
        </Text>
      )}
      {!locked && (
        <View style={styles.row}>
          <TextInput
            mode="outlined"
            dense
            placeholder="Nueva subtarea"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            returnKeyType="done"
            style={styles.input}
            accessibilityLabel="Nueva subtarea"
          />
          <IconButton
            icon="plus"
            mode="contained"
            disabled={!draft.trim()}
            accessibilityLabel="Agregar subtarea"
            onPress={submit}
          />
        </View>
      )}
      {subtasks.hasNextPage && (
        <Button loading={subtasks.isFetchingNextPage} onPress={() => void subtasks.fetchNextPage()}>
          Ver más
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 4 },
  bold: { fontWeight: "700", marginBottom: layout.itemGap },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { flex: 1 },
  input: { flex: 1 },
});
