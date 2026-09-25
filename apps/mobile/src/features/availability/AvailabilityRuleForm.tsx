import { zodResolver } from "@hookform/resolvers/zod";
import type { availabilityRuleSchema } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Button, Checkbox, HelperText, Menu, Text, TextInput, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { createAvailabilityRule, updateAvailabilityRule } from "@/core/api/availability";
import { layout } from "@/core/theme/layout";
import { clockToMinute, minuteToClock } from "./time";

type Rule = z.infer<typeof availabilityRuleSchema>;
const formSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startsAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Usa una hora válida HH:mm."),
  endsAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Usa una hora válida HH:mm."),
  nextDay: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;
const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function AvailabilityRuleForm({ rule, onDone }: { rule?: Rule; onDone(): void }) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [id] = useState(() => uuidv4());
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      weekday: rule?.weekday ?? 1,
      startsAt: minuteToClock(rule?.startMinute ?? 480),
      endsAt: minuteToClock(rule?.endMinute ?? 600),
      nextDay: (rule?.endMinute ?? 0) >= 1440,
    },
  });
  const weekday = watch("weekday");
  const nextDay = watch("nextDay");
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const startMinute = clockToMinute(values.startsAt);
      const endMinute = clockToMinute(values.endsAt) + (values.nextDay ? 1440 : 0);
      if (endMinute <= startMinute || endMinute - startMinute > 1440)
        throw new Error("El fin debe ser posterior al inicio y durar como máximo 24 horas.");
      return rule
        ? updateAvailabilityRule(rule.id, {
            weekday: values.weekday,
            startMinute,
            endMinute,
            version: rule.version,
          })
        : createAvailabilityRule({ id, weekday: values.weekday, startMinute, endMinute });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["availability-rules"] });
      onDone();
    },
  });

  return (
    <View style={styles.group}>
      <Text variant="titleMedium">{rule ? "Editar horario" : "Agregar horario semanal"}</Text>
      <Menu
        visible={menuOpen}
        onDismiss={() => setMenuOpen(false)}
        anchor={
          <Button mode="outlined" onPress={() => setMenuOpen(true)}>
            Día: {weekdays[weekday - 1]}
          </Button>
        }
      >
        {weekdays.map((label, index) => (
          <Menu.Item
            key={label}
            title={label}
            onPress={() => {
              setValue("weekday", index + 1);
              setMenuOpen(false);
            }}
          />
        ))}
      </Menu>
      <Controller
        control={control}
        name="startsAt"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Inicio"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.startsAt}
            placeholder="08:00"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.startsAt}>
        {errors.startsAt?.message}
      </HelperText>
      <Controller
        control={control}
        name="endsAt"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Fin"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.endsAt}
            placeholder="10:00"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.endsAt}>
        {errors.endsAt?.message}
      </HelperText>
      <Checkbox.Item
        label="Termina al día siguiente"
        status={nextDay ? "checked" : "unchecked"}
        onPress={() => setValue("nextDay", !nextDay)}
        accessibilityLabel="El horario termina al día siguiente"
      />
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      {save.isError && <Text accessibilityRole="alert">{save.error.message}</Text>}
      <View style={styles.actions}>
        {rule && <Button onPress={onDone}>Cancelar</Button>}
        <Button
          mode="contained"
          loading={save.isPending}
          disabled={offline || save.isPending}
          onPress={() => void handleSubmit((values) => save.mutate(values))()}
        >
          Guardar horario
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.fieldGap },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: layout.itemGap },
});
