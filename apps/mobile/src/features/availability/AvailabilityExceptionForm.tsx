import { zodResolver } from "@hookform/resolvers/zod";
import { shiftLocalDate } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, HelperText, IconButton, Text, useTheme } from "react-native-paper";
import { z } from "zod";
import { listAvailabilityExceptions, replaceAvailabilityException } from "@/core/api/availability";
import { layout } from "@/core/theme/layout";
import { userMessage } from "@/shared/errors";
import { DateField, FormSection, TimeField } from "@/shared/fields";
import { Button } from "@/shared/paper";
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
      queryClient.setQueryData(["availability-exception", updated.date], {
        items: [updated],
      });
      void queryClient.invalidateQueries({
        queryKey: ["availability-capacity"],
      });
    },
  });

  return (
    <View style={styles.group}>
      <FormSection
        title="Excepción por fecha"
        hint="Sin intervalos, todo el día queda como no disponible."
      >
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <DateField
              label="Fecha"
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                setValue("windows", "");
              }}
              error={!!errors.date}
            />
          )}
        />
        {errors.date && <HelperText type="error">{errors.date.message}</HelperText>}
        {existing.isFetching && <ActivityIndicator accessibilityLabel="Consultando excepción" />}
        {current && (
          <Button onPress={() => setValue("windows", windowsToText(current.windows))}>
            Cargar intervalos actuales
          </Button>
        )}
        <Controller
          control={control}
          name="windows"
          render={({ field }) => <WindowsEditor value={field.value} onChange={field.onChange} />}
        />
        {errors.windows && <HelperText type="error">{errors.windows.message}</HelperText>}
      </FormSection>
      {existing.isError && <Text accessibilityRole="alert">{userMessage(existing.error)}</Text>}
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
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

type Window = { start: string; end: string };

// El formulario guarda los intervalos como "08:00-10:00, 14:00-16:00" (lo que
// valida parseWindows); aquí se editan como filas con relojes.
function toRows(value: string): Window[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [start = "", end = ""] = part.split("-").map((item) => item.trim());
      return { start, end };
    });
}
const toText = (rows: Window[]) => rows.map((row) => `${row.start}-${row.end}`).join(", ");

function WindowsEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const theme = useTheme();
  const rows = toRows(value);
  const update = (index: number, change: Partial<Window>) =>
    onChange(toText(rows.map((row, i) => (i === index ? { ...row, ...change } : row))));
  return (
    <View style={styles.windows}>
      <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
        Horas disponibles ese día
      </Text>
      {rows.length === 0 && (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Ninguna: todo el día queda no disponible.
        </Text>
      )}
      {rows.map((row, index) => (
        // Las filas no tienen identidad propia: la posición es la fila.
        // biome-ignore lint/suspicious/noArrayIndexKey: la posición identifica el intervalo
        <View key={index} style={styles.windowRow}>
          <TimeField
            label="Desde"
            value={row.start}
            onChange={(start) => update(index, { start })}
          />
          <TimeField label="Hasta" value={row.end} onChange={(end) => update(index, { end })} />
          <IconButton
            icon="close"
            size={20}
            accessibilityLabel={`Quitar intervalo ${index + 1}`}
            onPress={() => onChange(toText(rows.filter((_, i) => i !== index)))}
            style={styles.remove}
          />
        </View>
      ))}
      <Button
        mode="outlined"
        icon="plus"
        onPress={() => {
          const last = rows.at(-1)?.end;
          const start = last && /^\d{2}:\d{2}$/.test(last) ? last : "08:00";
          const end = `${String(Math.min(23, Number(start.slice(0, 2)) + 2)).padStart(2, "0")}:${start.slice(3)}`;
          onChange(toText([...rows, { start, end }]));
        }}
      >
        Agregar intervalo
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.fieldGap },
  windows: { gap: 10 },
  label: { fontWeight: "600" },
  windowRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  remove: { margin: 0, marginTop: 6 },
});
