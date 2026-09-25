import { zodResolver } from "@hookform/resolvers/zod";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { z } from "zod";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/core/api/notifications";
import { layout } from "@/core/theme/layout";

const minutesBetween = (minimum: number, maximum: number) =>
  z
    .string()
    .regex(/^\d+$/, "Escribe un número entero.")
    .refine((value) => Number(value) >= minimum && Number(value) <= maximum, {
      message: `Usa un valor entre ${minimum} y ${maximum} minutos.`,
    });
const formSchema = z.object({
  deadlineLeadMinutes: minutesBetween(15, 10080),
  blockLeadMinutes: minutesBetween(5, 120),
  riskCooldownMinutes: minutesBetween(60, 10080),
});
type FormValues = z.infer<typeof formSchema>;

export function NotificationPreferencesForm() {
  const preferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: getNotificationPreferences,
    retry: false,
  });
  if (preferences.isPending)
    return <ActivityIndicator accessibilityLabel="Cargando preferencias de avisos" />;
  if (preferences.isError)
    return (
      <View style={styles.group}>
        <Text accessibilityRole="alert">{preferences.error.message}</Text>
        <Button onPress={() => void preferences.refetch()}>Reintentar</Button>
      </View>
    );
  return <Form key={preferences.data.version} value={preferences.data} />;
}

function Form({ value }: { value: Awaited<ReturnType<typeof getNotificationPreferences>> }) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      deadlineLeadMinutes: String(value.deadlineLeadMinutes),
      blockLeadMinutes: String(value.blockLeadMinutes),
      riskCooldownMinutes: String(value.riskCooldownMinutes),
    },
  });
  const save = useMutation({
    mutationFn: (values: FormValues) =>
      updateNotificationPreferences({
        deadlineLeadMinutes: Number(values.deadlineLeadMinutes),
        blockLeadMinutes: Number(values.blockLeadMinutes),
        riskCooldownMinutes: Number(values.riskCooldownMinutes),
        version: value.version,
      }),
    onSuccess: (updated) => queryClient.setQueryData(["notification-preferences"], updated),
  });
  return (
    <View style={styles.group}>
      <Text variant="titleMedium">Anticipación de avisos</Text>
      {(
        [
          ["deadlineLeadMinutes", "Avisar antes del plazo (minutos)"],
          ["blockLeadMinutes", "Avisar antes del bloque (minutos)"],
          ["riskCooldownMinutes", "Espera entre alertas de riesgo (minutos)"],
        ] as const
      ).map(([name, label]) => (
        <View key={name}>
          <Controller
            control={control}
            name={name}
            render={({ field }) => (
              <TextInput
                mode="outlined"
                label={label}
                keyboardType="number-pad"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={!!errors[name]}
              />
            )}
          />
          <HelperText type="error" visible={!!errors[name]}>
            {errors[name]?.message}
          </HelperText>
        </View>
      ))}
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      {save.isError && <Text accessibilityRole="alert">{save.error.message}</Text>}
      {save.isSuccess && <Text accessibilityRole="alert">Preferencias de avisos guardadas.</Text>}
      <Button
        mode="outlined"
        loading={save.isPending}
        disabled={offline || save.isPending}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
      >
        Guardar anticipaciones
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.fieldGap } });
