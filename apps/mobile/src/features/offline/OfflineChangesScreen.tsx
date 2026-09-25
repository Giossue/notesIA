import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
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
import {
  discardQueuedMutation,
  listQueuedMutations,
  retryQueuedMutation,
  syncOutbox,
} from "@/core/offline/outbox";
import { layout } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { ScreenLayout } from "@/shared/ScreenLayout";

const statusLabels = { pending: "Pendiente", conflict: "Conflicto", failed: "Falló" };
const entityLabels = {
  activity: "Actividad",
  progress: "Progreso",
  time_entry: "Registro de tiempo",
};
const operationLabels = { create: "crear", update: "actualizar", delete: "eliminar" };

export function OfflineChangesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [discardId, setDiscardId] = useState<string | null>(null);
  const queue = useQuery({
    queryKey: ["offline-outbox"],
    queryFn: listQueuedMutations,
    refetchInterval: 3000,
    retry: false,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["offline-outbox"] });
  const sync = useMutation({
    mutationFn: syncOutbox,
    onSuccess: (result) => {
      refresh();
      if (result.synced > 0)
        void queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] !== "offline-outbox",
        });
    },
  });
  const retry = useMutation({ mutationFn: retryQueuedMutation, onSuccess: refresh });
  const discard = useMutation({
    mutationFn: discardQueuedMutation,
    onSuccess: () => {
      setDiscardId(null);
      refresh();
    },
  });
  return (
    <ScreenLayout>
      <Button icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver">
        Volver
      </Button>
      <Text variant="headlineMedium">Cambios sin conexión</Text>
      <Text>
        Los cambios se envían en orden al recuperar la conexión. Los conflictos nunca se reemplazan
        de forma silenciosa.
      </Text>
      {offline && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          Sigues sin conexión.
        </Text>
      )}
      <Button
        mode="contained"
        loading={sync.isPending}
        disabled={offline || sync.isPending}
        onPress={() => sync.mutate()}
      >
        Sincronizar ahora
      </Button>
      {sync.isError && <Text accessibilityRole="alert">{sync.error.message}</Text>}
      {queue.isPending && <ActivityIndicator accessibilityLabel="Cargando cambios pendientes" />}
      {queue.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{queue.error.message}</Text>
          <Button onPress={() => void queue.refetch()}>Reintentar</Button>
        </View>
      )}
      {queue.data?.length === 0 && (
        <EmptyState icon="cloud-check-outline" message="No hay cambios pendientes." />
      )}
      {queue.data?.map((item) => (
        <Card key={item.id} mode="contained">
          <Card.Content style={styles.group}>
            <Text variant="titleMedium">
              {entityLabels[item.entity as keyof typeof entityLabels] ?? item.entity} ·{" "}
              {operationLabels[item.operation as keyof typeof operationLabels] ?? item.operation}
            </Text>
            <Text>Estado: {statusLabels[item.status]}</Text>
            <Text variant="bodySmall">Guardado: {new Date(item.created_at).toLocaleString()}</Text>
            {item.base_version !== null && (
              <Text variant="bodySmall">Versión de origen: {item.base_version}</Text>
            )}
            {item.error_title && (
              <Text accessibilityRole="alert">
                {item.error_title} ({item.error_code})
              </Text>
            )}
            {item.status === "conflict" && item.entity === "activity" && (
              <Button onPress={() => navigation.navigate("ActivityForm", { id: item.entity_id })}>
                Abrir versión del servidor
              </Button>
            )}
            {item.status === "failed" && (
              <Button disabled={offline || retry.isPending} onPress={() => retry.mutate(item.id)}>
                Reintentar
              </Button>
            )}
            <Button textColor={theme.colors.error} onPress={() => setDiscardId(item.id)}>
              Descartar cambio local
            </Button>
          </Card.Content>
        </Card>
      ))}
      <Portal>
        <Dialog visible={discardId !== null} onDismiss={() => setDiscardId(null)}>
          <Dialog.Title>Descartar cambio local</Dialog.Title>
          <Dialog.Content>
            <Text>
              Este cambio pendiente se eliminará del dispositivo y no llegará al servidor.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDiscardId(null)}>Cancelar</Button>
            <Button
              loading={discard.isPending}
              onPress={() => discardId && discard.mutate(discardId)}
            >
              Descartar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
