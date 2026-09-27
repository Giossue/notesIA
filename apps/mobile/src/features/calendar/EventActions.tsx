import type { CalendarEvent } from "@notesia/contracts";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Portal, Text } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { OfflineQueuedError } from "@/core/api/api-error";
import { deleteCalendarEvent } from "@/core/api/calendar-events";
import { sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { Button, Dialog } from "@/shared/paper";

export function EventActions({ event }: { event: CalendarEvent }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mutationId] = useState(() => uuidv4());
  const remove = useMutation({
    mutationFn: () => deleteCalendarEvent(event.id, event.version, mutationId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["calendar-event", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda-events"] });
      setConfirmOpen(false);
      navigation.goBack();
    },
    onError: (error) => {
      if (!(error instanceof OfflineQueuedError)) return;
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["offline-outbox"] });
      navigation.goBack();
    },
  });

  return (
    <>
      <Button
        mode="outlined"
        icon="delete-outline"
        disabled={remove.isPending}
        onPress={() => setConfirmOpen(true)}
        contentStyle={sharedStyles.actionContent}
      >
        Eliminar hora ocupada
      </Button>
      <Portal>
        <Dialog visible={confirmOpen} onDismiss={() => setConfirmOpen(false)}>
          <Dialog.Title>Eliminar hora ocupada</Dialog.Title>
          <Dialog.Content>
            <Text>Esta hora quedará libre para el plan de estudio.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button loading={remove.isPending} onPress={() => remove.mutate()}>
              Eliminar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
