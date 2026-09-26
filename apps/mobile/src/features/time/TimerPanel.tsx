import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { getActiveTimeEntry, startTimeEntry, stopTimeEntry } from "@/core/api/time-entries";
import { layout } from "@/core/theme/layout";
import { ActivityPicker } from "@/features/activities/ActivityPicker";
import { ActivityTitle } from "@/features/activities/ActivityTitle";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";

/** Con `activityId`, el temporizador queda fijo a esa tarea (dentro de su pantalla). */
export function TimerPanel({ activityId: fixedActivityId }: { activityId?: string } = {}) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [pickedActivityId, setActivityId] = useState("");
  const activityId = fixedActivityId ?? pickedActivityId;
  const nextStartId = useRef(uuidv4());
  const stopIdentity = useRef({ entryId: "", mutationId: uuidv4() });
  const active = useQuery({
    queryKey: ["active-time-entry"],
    queryFn: getActiveTimeEntry,
    enabled: !offline,
    retry: false,
    refetchInterval: 60_000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["active-time-entry"] });
    void queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    void queryClient.invalidateQueries({ queryKey: ["time-statistics"] });
  };
  const start = useMutation({
    mutationFn: () => startTimeEntry(nextStartId.current, activityId),
    onSuccess: () => {
      nextStartId.current = uuidv4();
      setActivityId("");
      refresh();
    },
  });
  const stop = useMutation({
    mutationFn: () => {
      const entry = active.data?.item;
      if (!entry) throw new Error("No hay una sesión activa.");
      if (stopIdentity.current.entryId !== entry.id)
        stopIdentity.current = { entryId: entry.id, mutationId: uuidv4() };
      return stopTimeEntry(entry.id, entry.version, stopIdentity.current.mutationId);
    },
    onSuccess: refresh,
  });
  const entry = active.data?.item;
  return (
    <Card mode="contained">
      <Card.Content style={styles.group}>
        <Text variant="titleMedium">Temporizador</Text>
        {active.isPending && !offline && (
          <ActivityIndicator accessibilityLabel="Consultando temporizador" />
        )}
        {active.isError && <Text accessibilityRole="alert">{userMessage(active.error)}</Text>}
        {offline && (
          <Text style={{ color: theme.colors.error }}>
            Sin conexión. El temporizador requiere conexión para mantener una sola sesión activa.
          </Text>
        )}
        {entry ? (
          <View style={styles.group}>
            <Text>Sesión iniciada: {new Date(entry.startsAt).toLocaleString()}</Text>
            <ActivityTitle id={entry.activityId} prefix="Actividad: " />
            <Button
              mode="contained"
              icon="stop"
              loading={stop.isPending}
              disabled={offline || stop.isPending}
              onPress={() => stop.mutate()}
            >
              Detener sesión
            </Button>
          </View>
        ) : (
          <View style={styles.group}>
            {!fixedActivityId && <ActivityPicker value={activityId} onChange={setActivityId} />}
            <Button
              mode="contained"
              icon="play"
              loading={start.isPending}
              disabled={offline || start.isPending || !activityId}
              onPress={() => start.mutate()}
            >
              Iniciar sesión
            </Button>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
