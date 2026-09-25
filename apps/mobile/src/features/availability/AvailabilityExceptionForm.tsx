import { zodResolver } from "@hookform/resolvers/zod";
import { shiftLocalDate } from "@notesia/domain";
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
import { listAvailabilityExceptions, replaceAvailabilityException } from "@/core/api/availability";
import { layout } from "@/core/theme/layout";
import { parseWindows, windowsToText } from "./time";

const dateSchema = z.iso.date("Usa AAAA-MM-DD.");
const formSchema = z.object({ date: dateSchema, windows: z.string() });
type FormValues = z.infer<typeof formSchema>;

export function AvailabilityExceptionForm() {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { date: "", windows: "" },
  });
  const date = watch("date");
  const existing = useQuery({
    queryKey: ["availability-exception", date],
    queryFn: () => listAvailabilityExceptions(date, shiftLocalDate(date, 1)),
    enabled: dateSchema.safeParse(date).success,
    retry: false,
  });
  const current = existing.data?.items[0];
  const save = useMutation({
    mutationFn: (values: FormValues) =>
      replaceAvailabilityException(values.date, {
        version: current?.version ?? null,
        windows: parseWindows(values.windows),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["availability-exception", updated.date], { items: [updated] });
      void queryClient.invalidateQueries({ queryKey: ["availability-capacity"] });
    },
  });

  return (
    <View style={styles.group}>
      <Text variant="titleMedium">Excepción por fecha</Text>
      <Text variant="bodySmall">
        Deja los intervalos vacíos para marcar todo el día como no disponible.
      </Text>
      <Controller
        control={control}
        name="date"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Fecha"
            placeholder="2026-10-15"
            value={field.value}
            onChangeText={(value) => {
              field.onChange(value);
              setValue("windows", "");
            }}
            onBlur={field.onBlur}
            error={!!errors.date}
          />
        )}
      />
      <HelperText type="error" visible={!!errors.date}>
        {errors.date?.message}
      </HelperText>
      {existing.isFetching && <ActivityIndicator accessibilityLabel="Consultando excepción" />}
      {current && (
        <Button onPress={() => setValue("windows", windowsToText(current.windows))}>
          Cargar intervalos actuales
        </Button>
      )}
      <Controller
        control={control}
        name="windows"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Intervalos disponibles"
            placeholder="08:00-10:00, 14:00-16:00"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.windows}
          />
        )}
      />
      <HelperText type="error" visible={!!errors.windows}>
        {errors.windows?.message}
      </HelperText>
      {existing.isError && <Text accessibilityRole="alert">{existing.error.message}</Text>}
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      {save.isError && <Text accessibilityRole="alert">{save.error.message}</Text>}
      {save.isSuccess && <Text accessibilityRole="alert">Excepción guardada.</Text>}
      <Button
        mode="contained"
        loading={save.isPending}
        disabled={offline || existing.isFetching || save.isPending}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
      >
        Guardar excepción
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.fieldGap } });
