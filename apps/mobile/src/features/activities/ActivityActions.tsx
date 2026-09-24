import type { Activity } from "@notesia/contracts";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Dialog, Portal, Text } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { setActivityArchived, transitionActivity } from "@/core/api/activities";
import type { RootStackParamList } from "@/navigation/types";

export function ActivityActions({ activity, offline }: { activity: Activity; offline: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [mutationId, setMutationId] = useState(() => uuidv4());
  const archive = useMutation({
    mutationFn: () => setActivityArchived(activity.id, activity.version, !activity.archivedAt),
    onSuccess: (updated) => {
      queryClient.setQueryData(["activity", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      setConfirmArchive(false);
      navigation.goBack();
    },
  });
  const transition = useMutation({
    mutationFn: () =>
      transitionActivity(
        activity.id,
        activity.version,
        mutationId,
        activity.status === "completed" ? "reopen" : "complete",
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(["activity", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["activity-history", activity.id] });
      setMutationId(uuidv4());
    },
  });

  return (
    <>
      {!activity.archivedAt && activity.status !== "cancelled" && (
        <Button
          mode="outlined"
          icon={activity.status === "completed" ? "undo" : "check"}
          disabled={offline || transition.isPending}
          loading={transition.isPending}
          onPress={() => transition.mutate()}
        >
          {activity.status === "completed" ? "Reabrir actividad" : "Completar actividad"}
        </Button>
      )}
      {transition.isError && <Text accessibilityRole="alert">{transition.error.message}</Text>}
      <Button
        mode="outlined"
        icon={activity.archivedAt ? "archive-arrow-up" : "archive-outline"}
        disabled={offline || archive.isPending}
        onPress={() => setConfirmArchive(true)}
      >
        {activity.archivedAt ? "Restaurar actividad" : "Archivar actividad"}
      </Button>
      {archive.isError && <Text accessibilityRole="alert">{archive.error.message}</Text>}
      <Portal>
        <Dialog visible={confirmArchive} onDismiss={() => setConfirmArchive(false)}>
          <Dialog.Title>
            {activity.archivedAt ? "Restaurar actividad" : "Archivar actividad"}
          </Dialog.Title>
          <Dialog.Content>
            <Text>
              {activity.archivedAt
                ? "La actividad volverá a aparecer en tu lista."
                : "La actividad pasará al archivo. Podrás restaurarla después."}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmArchive(false)}>Cancelar</Button>
            <Button loading={archive.isPending} onPress={() => archive.mutate()}>
              Confirmar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
