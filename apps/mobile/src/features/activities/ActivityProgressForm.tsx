import type { Activity } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button, HelperText, Text, TextInput, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { updateActivityProgress } from "@/core/api/activities";

export function ActivityProgressForm({ activity }: { activity: Activity }) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [value, setValue] = useState(String(activity.progressPercent));
  const identity = useRef({ value: activity.progressPercent, id: uuidv4() });
  const numericValue = Number(value);
  const valid = /^\d+$/.test(value) && numericValue >= 0 && numericValue <= 100;
  const save = useMutation({
    mutationFn: () => {
      if (!valid) throw new Error("El progreso debe estar entre 0 y 100.");
      if (identity.current.value !== numericValue)
        identity.current = { value: numericValue, id: uuidv4() };
      return updateActivityProgress(
        activity.id,
        activity.version,
        identity.current.id,
        numericValue,
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["activity", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      identity.current = { value: updated.progressPercent, id: uuidv4() };
    },
  });
  return (
    <>
      <Text variant="titleSmall">Progreso</Text>
      <TextInput
        mode="outlined"
        label="Progreso (0 a 100 %)"
        keyboardType="number-pad"
        value={value}
        onChangeText={setValue}
        error={!valid}
      />
      <HelperText type="error" visible={!valid}>
        El progreso debe estar entre 0 y 100.
      </HelperText>
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. El cambio quedará pendiente en este dispositivo.
        </Text>
      )}
      {save.isError && <Text accessibilityRole="alert">{save.error.message}</Text>}
      <Button
        mode="outlined"
        disabled={
          save.isPending || !valid || !!activity.archivedAt || activity.status === "cancelled"
        }
        loading={save.isPending}
        onPress={() => save.mutate()}
      >
        Guardar progreso
      </Button>
    </>
  );
}
