import type { CalendarEvent } from "@notesia/contracts";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Dialog, Portal, Text } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { setCalendarEventArchived } from "@/core/api/calendar-events";
import { sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";

export function EventActions({ event, offline }: { event: CalendarEvent; offline: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mutationId, setMutationId] = useState(() => uuidv4());
  const archive = useMutation({
    mutationFn: () =>
      setCalendarEventArchived(event.id, !event.archivedAt, event.version, mutationId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["calendar-event", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda-events"] });
      setMutationId(uuidv4());
      setConfirmOpen(false);
      navigation.goBack();
    },
  });

  return (
    <>
      <Button
        mode="outlined"
        icon={event.archivedAt ? "archive-arrow-up" : "archive-outline"}
        disabled={offline || archive.isPending}
        onPress={() => setConfirmOpen(true)}
        contentStyle={sharedStyles.actionContent}
      >
        {event.archivedAt ? "Restaurar evento" : "Archivar evento"}
      </Button>
      {archive.isError && <Text accessibilityRole="alert">{archive.error.message}</Text>}
      <Portal>
        <Dialog visible={confirmOpen} onDismiss={() => setConfirmOpen(false)}>
          <Dialog.Title>{event.archivedAt ? "Restaurar evento" : "Archivar evento"}</Dialog.Title>
          <Dialog.Content>
            <Text>
              {event.archivedAt
                ? "El evento volverá a aparecer en la agenda."
                : "El evento dejará de ocupar tiempo en la agenda. Podrás restaurarlo."}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button loading={archive.isPending} onPress={() => archive.mutate()}>
              Confirmar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
