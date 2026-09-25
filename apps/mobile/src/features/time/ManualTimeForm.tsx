import { zodResolver } from "@hookform/resolvers/zod";
import { localDateTimeToUtc } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { HelperText, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getProfile } from "@/core/api/profile";
import { addManualTimeEntry } from "@/core/api/time-entries";
import { layout } from "@/core/theme/layout";
import { ActivityPicker } from "@/features/activities/ActivityPicker";
import { DateTimeField } from "@/shared/fields";
import { Button, TextInput } from "@/shared/paper";

const formSchema = z.object({
  activityId: z.uuid("Selecciona una actividad."),
  minutes: z
    .string()
    .regex(/^\d+$/, "Escribe minutos enteros.")
    .refine((value) => Number(value) >= 1 && Number(value) <= 1440, {
      message: "Usa entre 1 y 1440 minutos.",
    }),
  endsLocal: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "Usa AAAA-MM-DD HH:mm."),
});
type FormValues = z.infer<typeof formSchema>;

export function ManualTimeForm() {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: false,
  });
  const requestIdentity = useRef({ fingerprint: "", id: uuidv4() });
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { activityId: "", minutes: "", endsLocal: "" },
  });
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      if (!profile.data) throw new Error("El perfil aún no está disponible.");
      let endsAt: string;
      try {
        endsAt = localDateTimeToUtc(values.endsLocal.replace(" ", "T"), profile.data.timeZone);
      } catch {
        throw new Error(`La fecha no existe o es ambigua en ${profile.data.timeZone}.`);
      }
      const fields = {
        activityId: values.activityId,
        minutes: Number(values.minutes),
        endsAt,
      };
      const fingerprint = JSON.stringify(fields);
      if (requestIdentity.current.fingerprint !== fingerprint)
        requestIdentity.current = { fingerprint, id: uuidv4() };
      return addManualTimeEntry({ id: requestIdentity.current.id, ...fields });
    },
    onSuccess: () => {
      requestIdentity.current = { fingerprint: "", id: uuidv4() };
      reset();
      void queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["time-statistics"] });
    },
  });
  return (
    <View style={styles.group}>
      <Text variant="titleMedium">Registro manual</Text>
      <Controller
        control={control}
        name="activityId"
        render={({ field }) => <ActivityPicker value={field.value} onChange={field.onChange} />}
      />
      <HelperText type="error" visible={!!errors.activityId}>
        {errors.activityId?.message}
      </HelperText>
      <Controller
        control={control}
        name="minutes"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Minutos trabajados"
            keyboardType="number-pad"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.minutes}
          />
        )}
      />
      <HelperText type="error" visible={!!errors.minutes}>
        {errors.minutes?.message}
      </HelperText>
      <Controller
        control={control}
        name="endsLocal"
        render={({ field }) => (
          <DateTimeField
            label="Terminó en"
            value={field.value}
            onChange={field.onChange}
            error={!!errors.endsLocal}
          />
        )}
      />
      <HelperText type={errors.endsLocal ? "error" : "info"} visible>
        {errors.endsLocal?.message ??
          `Hora local en ${profile.data?.timeZone ?? "tu zona horaria"}.`}
      </HelperText>
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. El registro quedará pendiente en este dispositivo.
        </Text>
      )}
      {save.isSuccess && <Text accessibilityRole="alert">Tiempo registrado.</Text>}
      <Button
        mode="outlined"
        loading={save.isPending}
        disabled={save.isPending || !profile.data}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
      >
        Registrar tiempo
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.fieldGap } });
