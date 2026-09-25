import type { Activity } from "@notesia/contracts";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button, Dialog, Portal, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { deleteActivity, setActivityArchived, transitionActivity } from "@/core/api/activities";
import { OfflineQueuedError } from "@/core/api/client";
import type { RootStackParamList } from "@/navigation/types";

export function ActivityActions({ activity, offline }: { activity: Activity; offline: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const transitionIdentity = useRef({ fingerprint: "", id: uuidv4() });
  const [deleteMutationId, setDeleteMutationId] = useState(() => uuidv4());
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
    mutationFn: (action: "complete" | "reopen" | "cancel") => {
      const fingerprint = `${activity.version}:${action}`;
      if (transitionIdentity.current.fingerprint !== fingerprint) {
        transitionIdentity.current = { fingerprint, id: uuidv4() };
      }
      return transitionActivity(
        activity.id,
        activity.version,
        transitionIdentity.current.id,
        action,
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["activity", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["activity-history", activity.id] });
      setConfirmCancel(false);
      transitionIdentity.current = { fingerprint: "", id: uuidv4() };
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteActivity(activity.id, activity.version, deleteMutationId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["activity", activity.id] });
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda-upcoming"] });
      navigation.goBack();
    },
    onError: (error) => {
      if (!(error instanceof OfflineQueuedError)) return;
      setConfirmDelete(false);
      setDeleteMutationId(uuidv4());
      void queryClient.invalidateQueries({ queryKey: ["offline-outbox"] });
      navigation.navigate("OfflineChanges");
    },
  });

  return (
    <>
      {!activity.archivedAt && (
        <Button
          mode="outlined"
          icon={
            activity.status === "completed" || activity.status === "cancelled" ? "undo" : "check"
          }
          disabled={offline || transition.isPending}
          loading={transition.isPending}
          onPress={() =>
            transition.mutate(
              activity.status === "completed" || activity.status === "cancelled"
                ? "reopen"
                : "complete",
            )
          }
        >
          {activity.status === "completed"
            ? "Reabrir actividad"
            : activity.status === "cancelled"
              ? "Reactivar actividad"
              : "Completar actividad"}
        </Button>
      )}
      {!activity.archivedAt &&
        activity.status !== "completed" &&
        activity.status !== "cancelled" && (
          <Button
            mode="outlined"
            icon="cancel"
            textColor={theme.colors.error}
            disabled={offline || transition.isPending}
            onPress={() => setConfirmCancel(true)}
          >
            Cancelar actividad
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
      <Button
        mode="outlined"
        icon="delete-outline"
        textColor={theme.colors.error}
        disabled={remove.isPending}
        onPress={() => setConfirmDelete(true)}
      >
        Eliminar actividad
      </Button>
      {remove.isError && !(remove.error instanceof OfflineQueuedError) && (
        <Text accessibilityRole="alert">{remove.error.message}</Text>
      )}
      <Portal>
        <Dialog visible={confirmCancel} onDismiss={() => setConfirmCancel(false)}>
          <Dialog.Title>Cancelar actividad</Dialog.Title>
          <Dialog.Content>
            <Text>
              La actividad dejará de participar en planes, riesgo, temporizador y avisos. Podrás
              reactivarla conservando su progreso.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmCancel(false)}>Volver</Button>
            <Button
              textColor={theme.colors.error}
              loading={transition.isPending}
              onPress={() => transition.mutate("cancel")}
            >
              Cancelar actividad
            </Button>
          </Dialog.Actions>
        </Dialog>
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
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)}>
          <Dialog.Title>Eliminar actividad</Dialog.Title>
          <Dialog.Content>
            <Text>
              Se eliminará la actividad. El historial técnico necesario para sincronización y
              auditoría se conservará según la política vigente.
            </Text>
            {offline && (
              <Text>
                Estás sin conexión. La eliminación quedará pendiente hasta que sincronices.
              </Text>
            )}
            {remove.isError && !(remove.error instanceof OfflineQueuedError) && (
              <Text accessibilityRole="alert">{remove.error.message}</Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button
              textColor={theme.colors.error}
              loading={remove.isPending}
              onPress={() => remove.mutate()}
            >
              Eliminar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
