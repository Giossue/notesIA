import { zodResolver } from "@hookform/resolvers/zod";
import type { availabilityRuleSchema } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Checkbox, HelperText, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { createAvailabilityRule, updateAvailabilityRule } from "@/core/api/availability";
import { layout } from "@/core/theme/layout";
import { FormSection, SelectField, TimeField } from "@/shared/fields";
import { Button } from "@/shared/paper";
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
        : createAvailabilityRule({
            id,
            weekday: values.weekday,
            startMinute,
            endMinute,
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["availability-rules"] });
      onDone();
    },
  });

  return (
    <View style={styles.group}>
      <FormSection title={rule ? "Editar horario" : "Agregar horario semanal"}>
        <SelectField
          label="Día"
          value={String(weekday)}
          options={weekdays.map((label, index) => ({ value: String(index + 1), label }))}
          onChange={(value) => setValue("weekday", Number(value))}
        />
        <View style={styles.row}>
          <Controller
            control={control}
            name="startsAt"
            render={({ field }) => (
              <TimeField
                label="Desde"
                value={field.value}
                onChange={field.onChange}
                error={!!errors.startsAt}
              />
            )}
          />
          <Controller
            control={control}
            name="endsAt"
            render={({ field }) => (
              <TimeField
                label="Hasta"
                value={field.value}
                onChange={field.onChange}
                error={!!errors.endsAt}
              />
            )}
          />
        </View>
        {(errors.startsAt || errors.endsAt) && (
          <HelperText type="error">{(errors.startsAt ?? errors.endsAt)?.message}</HelperText>
        )}
      </FormSection>
      <Checkbox.Item
        label="Termina al día siguiente"
        status={nextDay ? "checked" : "unchecked"}
        onPress={() => setValue("nextDay", !nextDay)}
        accessibilityLabel="El horario termina al día siguiente"
      />
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
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
  row: { flexDirection: "row", gap: 10 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: layout.itemGap,
  },
});
