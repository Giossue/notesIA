import type { CalendarEvent } from "@notesia/contracts";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Portal, Text } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { deleteCalendarEvent } from "@/core/api/calendar-events";
import { sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { Button, Dialog } from "@/shared/paper";

export function EventActions({ event, offline }: { event: CalendarEvent; offline: boolean }) {
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
  });

  return (
    <>
      <Button
        mode="outlined"
        icon="delete-outline"
        disabled={offline || remove.isPending}
        onPress={() => setConfirmOpen(true)}
        contentStyle={sharedStyles.actionContent}
      >
        Eliminar compromiso
      </Button>
      <Portal>
        <Dialog visible={confirmOpen} onDismiss={() => setConfirmOpen(false)}>
          <Dialog.Title>Eliminar compromiso</Dialog.Title>
          <Dialog.Content>
            <Text>El compromiso se borrará y esa hora quedará libre en la agenda.</Text>
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
