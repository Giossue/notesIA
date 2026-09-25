import { zodResolver } from "@hookform/resolvers/zod";
import type { Subtask } from "@notesia/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { HelperText } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { createSubtask, updateSubtask } from "@/core/api/subtasks";
import { sharedStyles } from "@/core/theme/layout";
import { Button, TextInput } from "@/shared/paper";

const formSchema = z.object({
  title: z.string().trim().min(1, "Escribe un título.").max(240),
  estimatedMinutes: z
    .string()
    .refine(
      (value) => !value || (/^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 525600),
      "Escribe minutos entre 1 y 525600.",
    ),
});
type FormValues = z.infer<typeof formSchema>;

export function SubtaskEditor({
  activityId,
  subtask,
  disabled,
  onDone,
}: {
  activityId: string;
  subtask?: Subtask;
  disabled: boolean;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [requestId, setRequestId] = useState(() => uuidv4());
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: subtask?.title ?? "",
      estimatedMinutes: subtask?.estimatedMinutes?.toString() ?? "",
    },
  });
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const fields = {
        title: values.title.trim(),
        estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : null,
      };
      return subtask
        ? updateSubtask(activityId, subtask.id, {
            ...fields,
            isCompleted: subtask.isCompleted,
            version: subtask.version,
            mutationId: requestId,
          })
        : createSubtask(activityId, { ...fields, id: requestId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["subtasks", activityId],
      });
      setRequestId(uuidv4());
      if (subtask) onDone?.();
      else reset({ title: "", estimatedMinutes: "" });
    },
  });

  return (
    <View style={sharedStyles.formFields}>
      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Título de la subtarea"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.title}
            accessibilityLabel="Título de la subtarea"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.title}>
        {errors.title?.message}
      </HelperText>
      <Controller
        control={control}
        name="estimatedMinutes"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Minutos estimados (opcional)"
            keyboardType="number-pad"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.estimatedMinutes}
            accessibilityLabel="Minutos estimados de la subtarea"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.estimatedMinutes}>
        {errors.estimatedMinutes?.message}
      </HelperText>
      <Button
        mode="contained"
        icon={subtask ? "content-save" : "plus"}
        loading={save.isPending}
        disabled={disabled || save.isPending}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
        contentStyle={sharedStyles.actionContent}
      >
        {subtask ? "Guardar subtarea" : "Añadir subtarea"}
      </Button>
    </View>
  );
}
