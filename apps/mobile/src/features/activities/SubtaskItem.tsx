import type { Subtask } from "@notesia/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Checkbox, Portal, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { setSubtaskArchived, updateSubtask } from "@/core/api/subtasks";
import { layout } from "@/core/theme/layout";
import { Button, Card, Dialog } from "@/shared/paper";
import { SubtaskEditor } from "./SubtaskEditor";

export function SubtaskItem({ subtask, disabled }: { subtask: Subtask; disabled: boolean }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [toggleId, setToggleId] = useState(() => uuidv4());
  const [archiveId, setArchiveId] = useState(() => uuidv4());
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["subtasks", subtask.activityId],
    });
  const toggle = useMutation({
    mutationFn: () =>
      updateSubtask(subtask.activityId, subtask.id, {
        title: subtask.title,
        estimatedMinutes: subtask.estimatedMinutes,
        isCompleted: !subtask.isCompleted,
        version: subtask.version,
        mutationId: toggleId,
      }),
    onSuccess: async () => {
      setToggleId(uuidv4());
      await refresh();
    },
  });
  const archive = useMutation({
    mutationFn: () =>
      setSubtaskArchived(
        subtask.activityId,
        subtask.id,
        !subtask.archivedAt,
        subtask.version,
        archiveId,
      ),
    onSuccess: async () => {
      setArchiveId(uuidv4());
      setArchiveOpen(false);
      await refresh();
    },
  });

  return (
    <Card mode="contained">
      <Card.Content style={{ gap: layout.itemGap }}>
        <Checkbox.Item
          label={subtask.title}
          status={subtask.isCompleted ? "checked" : "unchecked"}
          onPress={() => toggle.mutate()}
          disabled={disabled || !!subtask.archivedAt || toggle.isPending}
          accessibilityLabel={`${subtask.isCompleted ? "Reabrir" : "Completar"} subtarea ${subtask.title}`}
        />
        {subtask.estimatedMinutes && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Estimado: {subtask.estimatedMinutes} minutos
          </Text>
        )}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: layout.itemGap,
          }}
        >
          {!subtask.archivedAt && (
            <Button mode="text" icon="pencil" disabled={disabled} onPress={() => setEditOpen(true)}>
              Editar
            </Button>
          )}
          <Button
            mode="text"
            icon={subtask.archivedAt ? "archive-arrow-up" : "archive-outline"}
            disabled={disabled || archive.isPending}
            onPress={() => setArchiveOpen(true)}
          >
            {subtask.archivedAt ? "Restaurar" : "Archivar"}
          </Button>
        </View>
      </Card.Content>
      <Portal>
        <Dialog visible={editOpen} onDismiss={() => setEditOpen(false)}>
          <Dialog.Title>Editar subtarea</Dialog.Title>
          <Dialog.Content>
            <SubtaskEditor
              key={`${subtask.id}-${subtask.version}`}
              activityId={subtask.activityId}
              subtask={subtask}
              disabled={disabled}
              onDone={() => setEditOpen(false)}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditOpen(false)}>Cerrar</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={archiveOpen} onDismiss={() => setArchiveOpen(false)}>
          <Dialog.Title>
            {subtask.archivedAt ? "Restaurar subtarea" : "Archivar subtarea"}
          </Dialog.Title>
          <Dialog.Content>
            <Text>
              {subtask.archivedAt
                ? "La subtarea volverá a la lista activa."
                : "Podrás restaurar esta subtarea desde el archivo."}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setArchiveOpen(false)}>Cancelar</Button>
            <Button loading={archive.isPending} onPress={() => archive.mutate()}>
              Confirmar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Card>
  );
}
