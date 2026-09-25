import { zodResolver } from "@hookform/resolvers/zod";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, HelperText, Switch, Text, useTheme } from "react-native-paper";
import { z } from "zod";
import { getPreferences, updatePreferences } from "@/core/api/preferences";
import { getProfile } from "@/core/api/profile";
import { layout, sharedStyles } from "@/core/theme/layout";
import { clockToMinute, minuteToClock } from "@/features/availability/time";
import { userMessage } from "@/shared/errors";
import { FormSection, TimeField } from "@/shared/fields";
import { Button, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { TimeZoneField } from "@/shared/TimeZoneField";
import { saveTimeZone } from "@/shared/time-zones";

const minutesBetween = (minimum: number, maximum: number) =>
  z
    .string()
    .regex(/^\d+$/, "Escribe un número entero.")
    .refine((value) => Number(value) >= minimum && Number(value) <= maximum, {
      message: `Usa un valor entre ${minimum} y ${maximum} minutos.`,
    });
const clockText = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Usa una hora válida HH:mm.");
const formSchema = z
  .object({
    minSessionMinutes: minutesBetween(1, 240),
    maxSessionMinutes: minutesBetween(1, 480),
    maxDailyMinutes: minutesBetween(1, 1440),
    quietStart: clockText,
    quietEnd: clockText,
    notificationsEnabled: z.boolean(),
  })
  .superRefine((value, context) => {
    const minimum = Number(value.minSessionMinutes);
    if (Number(value.maxSessionMinutes) < minimum) {
      context.addIssue({
        code: "custom",
        path: ["maxSessionMinutes"],
        message: "La duración máxima debe ser igual o mayor que la mínima.",
      });
    }
    if (Number(value.maxDailyMinutes) < minimum) {
      context.addIssue({
        code: "custom",
        path: ["maxDailyMinutes"],
        message: "El máximo diario debe permitir al menos una sesión mínima.",
      });
    }
    if (value.quietStart === value.quietEnd) {
      context.addIssue({
        code: "custom",
        path: ["quietEnd"],
        message: "El inicio y el fin de horas silenciosas deben ser distintos.",
      });
    }
  });
type FormValues = z.infer<typeof formSchema>;

export function PreferencesScreen() {
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: getPreferences,
    retry: false,
  });
  return (
    <ScreenLayout keyboardShouldPersistTaps="handled" header={{ title: "Preferencias" }}>
      {preferences.isPending && <ActivityIndicator accessibilityLabel="Cargando preferencias" />}
      {preferences.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{userMessage(preferences.error)}</Text>
          <Button onPress={() => void preferences.refetch()}>Reintentar</Button>
        </View>
      )}
      <TimeZoneSection />
      {preferences.data && (
        <PreferencesForm key={preferences.data.version} value={preferences.data} />
      )}
    </ScreenLayout>
  );
}

function TimeZoneSection() {
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const save = useMutation({
    mutationFn: (timeZone: string) => {
      if (!profile.data) throw new Error("El perfil aún no carga.");
      return saveTimeZone(profile.data, timeZone);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["profile"], updated);
      // Las fechas y la agenda se muestran en la zona del perfil.
      void queryClient.invalidateQueries();
    },
  });
  if (!profile.data) return null;
  return (
    <FormSection title="Región" hint="Todas las fechas y horas de la app se muestran en esta zona.">
      <TimeZoneField
        value={profile.data.timeZone}
        disabled={offline || save.isPending}
        onChange={(timeZone) => save.mutate(timeZone)}
      />
    </FormSection>
  );
}

function PreferencesForm({ value }: { value: Awaited<ReturnType<typeof getPreferences>> }) {
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
      minSessionMinutes: String(value.minSessionMinutes),
      maxSessionMinutes: String(value.maxSessionMinutes),
      maxDailyMinutes: String(value.maxDailyMinutes),
      quietStart: minuteToClock(value.quietStartMinute),
      quietEnd: minuteToClock(value.quietEndMinute),
      notificationsEnabled: value.notificationsEnabled,
    },
  });
  const save = useMutation({
    mutationFn: (values: FormValues) =>
      updatePreferences({
        minSessionMinutes: Number(values.minSessionMinutes),
        maxSessionMinutes: Number(values.maxSessionMinutes),
        maxDailyMinutes: Number(values.maxDailyMinutes),
        notificationsEnabled: values.notificationsEnabled,
        quietStartMinute: clockToMinute(values.quietStart),
        quietEndMinute: clockToMinute(values.quietEnd),
        version: value.version,
      }),
    onSuccess: (updated) => queryClient.setQueryData(["preferences"], updated),
  });
  return (
    <View style={styles.group}>
      <Text variant="bodyMedium">Estos límites se aplican al motor de planificación.</Text>
      {(
        [
          ["minSessionMinutes", "Duración mínima de sesión"],
          ["maxSessionMinutes", "Duración máxima de sesión"],
          ["maxDailyMinutes", "Máximo diario de estudio"],
        ] as const
      ).map(([name, label]) => (
        <View key={name}>
          <Controller
            control={control}
            name={name}
            render={({ field }) => (
              <TextInput
                mode="outlined"
                label={`${label} (minutos)`}
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
      {(["quietStart", "quietEnd"] as const).map((name) => (
        <View key={name}>
          <Controller
            control={control}
            name={name}
            render={({ field }) => (
              <TimeField
                label={
                  name === "quietStart" ? "Inicio de horas silenciosas" : "Fin de horas silenciosas"
                }
                value={field.value}
                onChange={field.onChange}
                error={!!errors[name]}
              />
            )}
          />
          <HelperText type="error" visible={!!errors[name]}>
            {errors[name]?.message}
          </HelperText>
        </View>
      ))}
      <Controller
        control={control}
        name="notificationsEnabled"
        render={({ field }) => (
          <SwitchRow
            label="Permitir notificaciones"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      {save.isSuccess && <Text accessibilityRole="alert">Preferencias guardadas.</Text>}
      <Button
        mode="contained"
        loading={save.isPending}
        disabled={offline || save.isPending}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
        contentStyle={sharedStyles.actionContent}
      >
        Guardar preferencias
      </Button>
    </View>
  );
}

function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.fieldGap },
  switchRow: {
    minHeight: layout.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: layout.itemGap,
  },
});
