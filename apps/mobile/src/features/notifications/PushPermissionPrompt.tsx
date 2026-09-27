import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Linking } from "react-native";
import * as Keychain from "react-native-keychain";
import { Portal, Text } from "react-native-paper";
import {
  enablePushDevice,
  getLocalPushDeviceId,
  PushPermissionBlockedError,
} from "@/core/push/push-registration";
import { userMessage } from "@/shared/errors";
import { Button, Dialog } from "@/shared/paper";

const promptedService = "ec.notesia.planner.push-prompted";

/**
 * Tras entrar por primera vez, invita a activar los avisos una sola vez. Si
 * dice que no, puede activarlos luego en Notificaciones.
 */
export function PushPermissionPrompt() {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let mounted = true;
    void Promise.all([
      getLocalPushDeviceId(),
      Keychain.getGenericPassword({ service: promptedService }),
    ])
      .then(([device, prompted]) => {
        if (mounted && !device && !prompted) setVisible(true);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  const remember = () =>
    void Keychain.setGenericPassword("push", "prompted", { service: promptedService }).catch(
      () => {},
    );
  const close = () => {
    remember();
    setVisible(false);
  };
  const enable = useMutation({
    mutationFn: enablePushDevice,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["push-devices"] });
      void queryClient.invalidateQueries({ queryKey: ["local-push-device"] });
      close();
    },
    // Aquí se explica en el diálogo; no repetir el toast global.
    meta: { silent: true },
  });
  const blocked = enable.error instanceof PushPermissionBlockedError;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={close}>
        <Dialog.Title>¿Te avisamos a tiempo?</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            {blocked
              ? "Las notificaciones están desactivadas para esta app. Actívalas en los Ajustes del teléfono."
              : "Te enviaremos un aviso antes de cada plazo, cuando toque avanzar en una tarea y si alguna está en riesgo."}
          </Text>
          {enable.isError && !blocked && (
            <Text variant="bodySmall" style={{ marginTop: 8 }}>
              {userMessage(enable.error)}
            </Text>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={close}>Ahora no</Button>
          {blocked ? (
            <Button
              mode="contained"
              icon="open-in-new"
              onPress={() => {
                close();
                void Linking.openSettings();
              }}
            >
              Abrir ajustes
            </Button>
          ) : (
            <Button
              mode="contained"
              icon="bell-outline"
              loading={enable.isPending}
              disabled={enable.isPending}
              onPress={() => enable.mutate()}
            >
              Activar avisos
            </Button>
          )}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
