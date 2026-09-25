import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Dialog,
  Portal,
  Text,
  useTheme,
} from "react-native-paper";
import { listPushDevices, removePushDevice } from "@/core/api/push-devices";
import {
  disableCurrentPushDevice,
  enablePushDevice,
  getLocalPushDeviceId,
} from "@/core/push/push-registration";
import { layout } from "@/core/theme/layout";

export function PushDevicePanel() {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [removeId, setRemoveId] = useState<string | null>(null);
  const devices = useQuery({ queryKey: ["push-devices"], queryFn: listPushDevices, retry: false });
  const localId = useQuery({ queryKey: ["local-push-device"], queryFn: getLocalPushDeviceId });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["push-devices"] });
    void queryClient.invalidateQueries({ queryKey: ["local-push-device"] });
  };
  const enable = useMutation({ mutationFn: enablePushDevice, onSuccess: refresh });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (id === localId.data) await disableCurrentPushDevice();
      else await removePushDevice(id);
    },
    onSuccess: () => {
      setRemoveId(null);
      refresh();
    },
  });
  return (
    <View style={styles.group}>
      <Text variant="titleMedium">Dispositivos push</Text>
      <Text>Los tokens se envían al servidor cifrado y no se muestran nuevamente.</Text>
      {(devices.isPending || localId.isPending) && (
        <ActivityIndicator accessibilityLabel="Cargando dispositivos push" />
      )}
      {devices.isError && <Text accessibilityRole="alert">{devices.error.message}</Text>}
      {devices.data?.map((device) => (
        <Card key={device.id} mode="outlined">
          <Card.Content style={styles.group}>
            <Text>
              {device.platform === "android" ? "Android" : "iOS"}
              {device.id === localId.data ? " · este dispositivo" : ""}
            </Text>
            <Text variant="bodySmall">
              Actualizado: {new Date(device.updatedAt).toLocaleString()}
            </Text>
            <Button disabled={offline} onPress={() => setRemoveId(device.id)}>
              Quitar dispositivo
            </Button>
          </Card.Content>
        </Card>
      ))}
      {!localId.data && (
        <Button
          mode="outlined"
          icon="bell-plus-outline"
          loading={enable.isPending}
          disabled={offline || enable.isPending}
          onPress={() => enable.mutate()}
        >
          Activar push en este dispositivo
        </Button>
      )}
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Conéctate para cambiar dispositivos.
        </Text>
      )}
      {(enable.isError || remove.isError) && (
        <Text accessibilityRole="alert">{enable.error?.message ?? remove.error?.message}</Text>
      )}
      <Portal>
        <Dialog visible={removeId !== null} onDismiss={() => setRemoveId(null)}>
          <Dialog.Title>Quitar dispositivo</Dialog.Title>
          <Dialog.Content>
            <Text>Este dispositivo dejará de recibir avisos push de tu cuenta.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRemoveId(null)}>Cancelar</Button>
            <Button loading={remove.isPending} onPress={() => removeId && remove.mutate(removeId)}>
              Quitar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
