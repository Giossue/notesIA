import type { Activity } from "@notesia/contracts";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { List, Portal, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { deleteActivity, transitionActivity } from "@/core/api/activities";
import { OfflineQueuedError } from "@/core/api/api-error";
import { patchCached } from "@/core/offline/optimistic";
import { sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { Button, Dialog } from "@/shared/paper";
import { Tabs } from "@/shared/Tabs";
import { ActivityHistory } from "./ActivityHistory";

type StatusChoice = "pending" | "in_progress" | "completed" | "cancelled";
type Transition = "complete" | "reopen" | "cancel" | "start" | "pause";

// Los cuatro estados del requisito (RF-15); "planificada" se muestra como pendiente.
const statusButtons: { value: StatusChoice; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "in_progress", label: "En progreso" },
  { value: "completed", label: "Completada" },
  { value: "cancelled", label: "Cancelada" },
];
const statusOf: Record<Transition, Activity["status"]> = {
  complete: "completed",
  reopen: "backlog",
  cancel: "cancelled",
  start: "in_progress",
  pause: "backlog",
};

export function statusChoice(activity: Activity): StatusChoice {
  if (activity.status === "backlog" || activity.status === "planned") return "pending";
  return activity.status;
}

/** Listas y fichas donde aparece la tarea: se actualizan al instante. */
const activityKeys = (id: string) => [
  ["activity", id],
  ["activities"],
  ["agenda"],
  ["agenda-upcoming-home"],
];

const refreshActivity = (queryClient: ReturnType<typeof useQueryClient>, id: string) => {
  for (const key of [
    ...activityKeys(id),
    ["activity-summary"],
    ["activity-history", id],
    ["streak"],
  ])
    void queryClient.invalidateQueries({ queryKey: key });
};

/**
 * Pasos para ir al estado elegido. Con conexión se encadenan (por ejemplo, de
 * cancelada a en progreso: reactivar y empezar); sin conexión solo se admite
 * un paso, porque el siguiente necesita la versión que devuelve el servidor.
 */
function stepsTo(activity: Activity, target: StatusChoice): Transition[] {
  const final = activity.status === "completed" || activity.status === "cancelled";
  const steps: Transition[] = [];
  if (final && statusChoice(activity) !== target) steps.push("reopen");
  const open = !final || steps.length > 0;
  if (target === "completed" && open) steps.push("complete");
  if (target === "cancelled" && open) steps.push("cancel");
  if (target === "in_progress" && (activity.status !== "in_progress" || steps.length > 0))
    steps.push("start");
  if (target === "pending" && activity.status === "in_progress" && steps.length === 0)
    steps.push("pause");
  return steps;
}

/** Estado de la tarea: selector de los cuatro estados y un botón grande de completar. */
export function TaskStatus({ activity, offline }: { activity: Activity; offline: boolean }) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const change = useMutation({
    mutationFn: async (target: StatusChoice) => {
      const steps = stepsTo(activity, target);
      if (offline && steps.length > 1)
        throw new Error(
          "Este cambio necesita conexión. Prueba de nuevo cuando vuelva el internet.",
        );
      let current = activity;
      for (const step of steps) {
        // Se ve al instante; sin conexión, el cambio queda en el teléfono.
        patchCached<Activity>(queryClient, activityKeys(activity.id), activity.id, {
          status: statusOf[step],
          version: current.version + 1,
          progressPercent: step === "complete" ? 100 : current.progressPercent,
        });
        current = await transitionActivity(current.id, current.version, uuidv4(), step);
      }
      return current;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["activity", updated.id], updated);
      refreshActivity(queryClient, activity.id);
      setConfirmCancel(false);
    },
    onError: (error) => {
      setConfirmCancel(false);
      if (!(error instanceof OfflineQueuedError)) refreshActivity(queryClient, activity.id);
    },
  });
  if (activity.archivedAt) return null;
  const completed = activity.status === "completed";

  return (
    <>
      <Button
        mode={completed ? "outlined" : "contained"}
        icon={completed ? "restore" : "check"}
        loading={change.isPending}
        disabled={change.isPending}
        onPress={() => change.mutate(completed ? "pending" : "completed")}
        contentStyle={sharedStyles.actionContent}
      >
        {completed ? "Reabrir tarea" : "Completar tarea"}
      </Button>
      <Tabs
        value={statusChoice(activity)}
        onValueChange={(target) => {
          if (target === "cancelled") setConfirmCancel(true);
          else change.mutate(target);
        }}
        buttons={statusButtons.map((button) => ({ ...button, disabled: change.isPending }))}
      />
      <Portal>
        <Dialog visible={confirmCancel} onDismiss={() => setConfirmCancel(false)}>
          <Dialog.Title>Cancelar tarea</Dialog.Title>
          <Dialog.Content>
            <Text>
              La tarea deja de contar para tu plan y tus avisos. Puedes reactivarla después y
              conserva su progreso.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmCancel(false)}>Volver</Button>
            <Button
              textColor={theme.colors.error}
              loading={change.isPending}
              onPress={() => change.mutate("cancelled")}
            >
              Cancelar tarea
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

/** Menú ⋮ de la tarea: editar, ver historial o eliminar. */
export function TaskMenu({
  activity,
  visible,
  onDismiss,
  onEdit,
}: {
  activity: Activity;
  visible: boolean;
  onDismiss(): void;
  onEdit(): void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [dialog, setDialog] = useState<"history" | "delete" | null>(null);
  const [deleteId] = useState(() => uuidv4());
  const leave = () => {
    setDialog(null);
    refreshActivity(queryClient, activity.id);
    navigation.goBack();
  };
  const remove = useMutation({
    mutationFn: () => deleteActivity(activity.id, activity.version, deleteId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["activity", activity.id] });
      leave();
    },
    onError: (error) => {
      if (error instanceof OfflineQueuedError) leave();
    },
  });
  const open = (next: typeof dialog) => {
    onDismiss();
    setDialog(next);
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{activity.title}</Dialog.Title>
        <Dialog.Content style={styles.menu}>
          {!activity.archivedAt && (
            <List.Item
              title="Editar"
              left={(props) => <List.Icon {...props} icon="pencil-outline" />}
              onPress={() => {
                onDismiss();
                onEdit();
              }}
            />
          )}
          <List.Item
            title="Ver historial"
            left={(props) => <List.Icon {...props} icon="history" />}
            onPress={() => open("history")}
          />
          <List.Item
            title="Eliminar"
            titleStyle={{ color: theme.colors.error }}
            left={(props) => (
              <List.Icon {...props} color={theme.colors.error} icon="delete-outline" />
            )}
            onPress={() => open("delete")}
          />
        </Dialog.Content>
      </Dialog>

      <Dialog visible={dialog === "history"} onDismiss={() => setDialog(null)}>
        <Dialog.Title>Historial</Dialog.Title>
        <Dialog.ScrollArea style={styles.scroll}>
          <ScrollView persistentScrollbar contentContainerStyle={styles.scrollContent}>
            {dialog === "history" && <ActivityHistory id={activity.id} />}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={() => setDialog(null)}>Cerrar</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={dialog === "delete"} onDismiss={() => setDialog(null)}>
        <Dialog.Title>Eliminar tarea</Dialog.Title>
        <Dialog.Content>
          <Text>
            La tarea y sus subtareas se eliminan y deja de aparecer en tu plan. Si ya la habías
            completado, sigue contando en tu progreso y tu racha. Esto no se puede deshacer.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setDialog(null)}>Cancelar</Button>
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
  );
}

const styles = StyleSheet.create({
  menu: { paddingHorizontal: 8 },
  scroll: { maxHeight: 420, paddingHorizontal: 0 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 12 },
});
