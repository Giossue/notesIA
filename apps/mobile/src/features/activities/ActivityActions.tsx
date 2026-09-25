import type { Activity } from "@notesia/contracts";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Portal, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { deleteActivity, setActivityArchived, transitionActivity } from "@/core/api/activities";
import { OfflineQueuedError } from "@/core/api/client";
import type { RootStackParamList } from "@/navigation/types";
import { LabeledField } from "@/shared/fields";
import { Button, Dialog } from "@/shared/paper";
import { Tabs } from "@/shared/Tabs";

type StatusChoice = "pending" | "in_progress" | "completed" | "cancelled";

// Los cuatro estados del requisito; "planificada" se muestra como pendiente.
const statusButtons: { value: StatusChoice; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "in_progress", label: "En progreso" },
  { value: "completed", label: "Completada" },
  { value: "cancelled", label: "Cancelada" },
];

function statusChoice(activity: Activity): StatusChoice {
  if (activity.status === "backlog" || activity.status === "planned") return "pending";
  return activity.status;
}

export function ActivityActions({ activity, offline }: { activity: Activity; offline: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  // Cambia al estado elegido encadenando las transiciones necesarias
  // (por ejemplo, de cancelada a en progreso: reactivar y luego iniciar).
  const changeStatus = useMutation({
    mutationFn: async (target: StatusChoice) => {
      let current = activity;
      const step = async (action: "complete" | "reopen" | "cancel" | "start" | "pause") => {
        current = await transitionActivity(current.id, current.version, uuidv4(), action);
      };
      const isFinal = (value: Activity) =>
        value.status === "completed" || value.status === "cancelled";
      if (isFinal(current) && statusChoice(current) !== target) await step("reopen");
      if (target === "completed" && !isFinal(current)) await step("complete");
      if (target === "cancelled" && !isFinal(current)) await step("cancel");
      if (target === "in_progress" && current.status !== "in_progress") await step("start");
      if (target === "pending" && current.status === "in_progress") await step("pause");
      return current;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["activity", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["activity-history", activity.id] });
      setConfirmCancel(false);
    },
    // Si una transición intermedia ya se aplicó, se recarga para mostrar el estado real.
    onError: () => void queryClient.invalidateQueries({ queryKey: ["activity", activity.id] }),
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
        <LabeledField label="Estado">
          <Tabs
            value={statusChoice(activity)}
            onValueChange={(target) => {
              if (target === "cancelled") setConfirmCancel(true);
              else changeStatus.mutate(target);
            }}
            buttons={statusButtons.map((button) => ({
              ...button,
              disabled: offline || changeStatus.isPending,
            }))}
          />
        </LabeledField>
      )}
      <Button
        mode="outlined"
        icon={activity.archivedAt ? "archive-arrow-up" : "archive-outline"}
        disabled={offline || archive.isPending}
        onPress={() => setConfirmArchive(true)}
      >
        {activity.archivedAt ? "Restaurar actividad" : "Archivar actividad"}
      </Button>
      <Button
        mode="outlined"
        icon="delete-outline"
        textColor={theme.colors.error}
        disabled={remove.isPending}
        onPress={() => setConfirmDelete(true)}
      >
        Eliminar actividad
      </Button>
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
              loading={changeStatus.isPending}
              onPress={() => changeStatus.mutate("cancelled")}
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
