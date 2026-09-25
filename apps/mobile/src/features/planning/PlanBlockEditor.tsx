import { zodResolver } from "@hookform/resolvers/zod";
import type { planBlockSchema, planSchema } from "@notesia/contracts";
import { localDateTimeToUtc, utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { HelperText, Text, useTheme } from "react-native-paper";
import { z } from "zod";
import { editPlanBlock } from "@/core/api/plans";
import { layout } from "@/core/theme/layout";
import { DateTimeField } from "@/shared/fields";
import { Button } from "@/shared/paper";

type Plan = z.infer<typeof planSchema>;
type Block = z.infer<typeof planBlockSchema>;
const formSchema = z.object({
  startsLocal: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "Usa AAAA-MM-DD HH:mm."),
  endsLocal: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "Usa AAAA-MM-DD HH:mm."),
});
type FormValues = z.infer<typeof formSchema>;

function toUtc(value: string, timeZone: string) {
  try {
    return localDateTimeToUtc(value.replace(" ", "T"), timeZone);
  } catch {
    throw new Error(`La fecha ${value} no existe o es ambigua en ${timeZone}.`);
  }
}

export function PlanBlockEditor({
  plan,
  block,
  timeZone,
  onUpdated,
  onCancel,
}: {
  plan: Plan;
  block: Block;
  timeZone: string;
  onUpdated(plan: Plan): void;
  onCancel(): void;
}) {
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      startsLocal: utcToLocalDateTime(block.startsAt, timeZone).replace("T", " "),
      endsLocal: utcToLocalDateTime(block.endsAt, timeZone).replace("T", " "),
    },
  });
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const startsAt = toUtc(values.startsLocal, timeZone);
      const endsAt = toUtc(values.endsLocal, timeZone);
      if (Date.parse(endsAt) <= Date.parse(startsAt)) {
        throw new Error("El fin debe ser posterior al inicio.");
      }
      return editPlanBlock(plan.id, block.id, {
        startsAt,
        endsAt,
        isLocked: block.isLocked,
        version: plan.version,
      });
    },
    onSuccess: onUpdated,
  });
  return (
    <View style={styles.group}>
      <Controller
        control={control}
        name="startsLocal"
        render={({ field }) => (
          <DateTimeField
            label="Inicio"
            value={field.value}
            onChange={field.onChange}
            error={!!errors.startsLocal}
          />
        )}
      />
      {errors.startsLocal && <HelperText type="error">{errors.startsLocal.message}</HelperText>}
      <Controller
        control={control}
        name="endsLocal"
        render={({ field }) => (
          <DateTimeField
            label="Fin"
            value={field.value}
            onChange={field.onChange}
            error={!!errors.endsLocal}
          />
        )}
      />
      {errors.endsLocal && <HelperText type="error">{errors.endsLocal.message}</HelperText>}
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      <View style={styles.actions}>
        <Button onPress={onCancel}>Cancelar</Button>
        <Button
          loading={save.isPending}
          disabled={offline || save.isPending}
          onPress={() => void handleSubmit((values) => save.mutate(values))()}
        >
          Guardar bloque
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.fieldGap },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: layout.itemGap,
  },
});
