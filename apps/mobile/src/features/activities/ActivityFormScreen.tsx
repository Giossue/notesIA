import { zodResolver } from "@hookform/resolvers/zod";
import { type Activity, activityCreateSchema, type Profile } from "@notesia/contracts";
import { localDateTimeToUtc, todayInTimeZone, utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, HelperText, IconButton, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { createActivity, getActivity, updateActivity } from "@/core/api/activities";
import { createActivitySeries } from "@/core/api/activity-series";
import { OfflineQueuedError } from "@/core/api/api-error";
import { getProfile } from "@/core/api/profile";
import { createSubtask } from "@/core/api/subtasks";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { kindChoices } from "@/shared/activity-kinds";
import { userMessage } from "@/shared/errors";
import {
  DateField,
  DateTimeField,
  DurationField,
  FormSection,
  LabeledField,
} from "@/shared/fields";
import { Button, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";
import { TaskMenu } from "./ActivityActions";
import { TaskDetail } from "./TaskDetail";

const localDateTime = z
  .string()
  .refine(
    (value) => !value || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value),
    "Usa AAAA-MM-DD HH:mm.",
  );
const formSchema = z
  .object({
    title: z.string().trim().min(1, "Escribe un título.").max(240),
    description: z.string().trim().max(10000),
    kind: z.enum(["academic_task", "exam", "personal", "routine"]),
    priority: z.enum(["low", "medium", "high", "critical"]),
    startAfterLocal: localDateTime,
    deadlineLocal: localDateTime,
    estimatedMinutes: z
      .string()
      .refine(
        (value) => !value || (/^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 525600),
        "Escribe minutos entre 1 y 525600.",
      ),
  })
  .refine(
    // Mismo formato local ordena igual que la fecha: basta comparar el texto.
    (value) =>
      !value.startAfterLocal || !value.deadlineLocal || value.deadlineLocal > value.startAfterLocal,
    { path: ["deadlineLocal"], message: "La fecha límite debe ser posterior a “Empezar desde”." },
  );
type FormValues = z.infer<typeof formSchema>;

const priorityLabels = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

function toUtc(value: string, timeZone: string) {
  if (!value) return null;
  try {
    return localDateTimeToUtc(value.replace(" ", "T"), timeZone);
  } catch {
    throw new Error(`La fecha ${value} no existe o es ambigua en ${timeZone}.`);
  }
}

export function ActivityFormScreen({
  id,
  draft,
  date,
}: {
  id?: string;
  draft?: { title?: string; description?: string; estimatedMinutes?: number };
  date?: string;
}) {
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: false,
  });
  const activity = useQuery({
    queryKey: ["activity", id],
    queryFn: () => getActivity(id ?? ""),
    enabled: !!id,
    retry: false,
  });

  // Una tarea existente se muestra; el formulario queda para crear o para "Editar".
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const showing = !!activity.data && !editing;

  return (
    <ScreenLayout
      keyboardShouldPersistTaps="handled"
      header={{
        title: !id ? "Nueva tarea" : editing ? "Editar tarea" : "Tarea",
        ...(editing
          ? { left: { icon: "close", label: "Cancelar edición", onPress: () => setEditing(false) } }
          : {}),
        ...(showing
          ? {
              right: { icon: "dots-vertical", label: "Opciones", onPress: () => setMenuOpen(true) },
            }
          : {}),
      }}
    >
      {(profile.isPending || (id && activity.isPending)) && (
        <ActivityIndicator accessibilityLabel="Cargando tarea" />
      )}
      {profile.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(profile.error)}</Text>
          <Button onPress={() => void profile.refetch()}>Reintentar perfil</Button>
        </View>
      )}
      {id && activity.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(activity.error)}</Text>
          <Button onPress={() => void activity.refetch()}>Reintentar tarea</Button>
        </View>
      )}
      {profile.data && showing && activity.data && (
        <>
          <TaskDetail activity={activity.data} profile={profile.data} />
          <TaskMenu
            activity={activity.data}
            visible={menuOpen}
            onDismiss={() => setMenuOpen(false)}
            onEdit={() => setEditing(true)}
          />
        </>
      )}
      {profile.data && (!id || (activity.data && editing)) && (
        <ActivityForm
          key={`${activity.data?.id ?? "new"}-${activity.data?.version ?? 0}-${JSON.stringify(draft)}-${date}`}
          activity={activity.data}
          profile={profile.data}
          draft={draft}
          date={date}
          onSaved={() => setEditing(false)}
        />
      )}
    </ScreenLayout>
  );
}

function ActivityForm({
  activity,
  profile,
  draft,
  date,
  onSaved,
}: {
  activity?: Activity;
  profile: Profile;
  draft?: { title?: string; description?: string; estimatedMinutes?: number };
  date?: string;
  /** Al editar una tarea existente, vuelve a su vista en lugar de salir. */
  onSaved(): void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [newId] = useState(() => uuidv4());
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: activity?.title ?? draft?.title ?? "",
      description: activity?.description ?? draft?.description ?? "",
      kind: activity?.kind ?? "academic_task",
      priority: activity?.priority ?? "medium",
      startAfterLocal: activity?.startAfterAt
        ? utcToLocalDateTime(activity.startAfterAt, profile.timeZone).replace("T", " ")
        : "",
      deadlineLocal: activity?.deadlineAt
        ? utcToLocalDateTime(activity.deadlineAt, profile.timeZone).replace("T", " ")
        : date
          ? `${date} 23:59`
          : "",
      estimatedMinutes:
        activity?.estimatedMinutes?.toString() ?? draft?.estimatedMinutes?.toString() ?? "",
    },
  });
  const selectedKind = watch("kind");
  const selectedPriority = watch("priority");
  // Solo al crear: repetir la tarea cada día o cada semana hasta una fecha.
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly">("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  // Pasos al crear la tarea: se guardan como subtareas justo después de crearla.
  const [steps, setSteps] = useState<{ id: string; title: string }[]>([]);
  const [stepDraft, setStepDraft] = useState("");
  const addStep = () => {
    const title = stepDraft.trim();
    if (!title) return;
    setSteps((current) => [...current, { id: uuidv4(), title: title.slice(0, 240) }]);
    setStepDraft("");
  };
  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!activity && repeat !== "none") {
        const startOn =
          values.deadlineLocal.slice(0, 10) ||
          todayInTimeZone(new Date().toISOString(), profile.timeZone);
        if (!repeatUntil) throw new Error("Elige hasta qué día se repite.");
        if (repeatUntil < startOn)
          throw new Error("La fecha «Hasta» debe ser igual o posterior al primer día.");
        await createActivitySeries({
          id: newId,
          // Un examen no se repite: la serie se crea como actividad académica.
          kind: values.kind === "exam" ? "academic_task" : values.kind,
          title: values.title.trim(),
          description: values.description.trim() || null,
          priority: values.priority,
          estimatedMinutes: Math.min(1440, Number(values.estimatedMinutes) || 60),
          frequency: repeat,
          startOn,
          throughOn: repeatUntil,
        });
        return null;
      }
      const fields = {
        kind: values.kind,
        title: values.title.trim(),
        description: values.description.trim() || null,
        priority: values.priority,
        startAfterAt: toUtc(values.startAfterLocal, profile.timeZone),
        deadlineAt: toUtc(values.deadlineLocal, profile.timeZone),
        estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : null,
      };
      if (activity)
        return updateActivity(activity.id, {
          ...fields,
          version: activity.version,
        });
      // Sin conexión la tarea y sus subtareas quedan en el teléfono, en orden.
      let queued: OfflineQueuedError | null = null;
      const keep = async <T,>(request: Promise<T>) => {
        try {
          return await request;
        } catch (error) {
          if (!(error instanceof OfflineQueuedError)) throw error;
          queued = error;
          return null;
        }
      };
      const created = await keep(
        createActivity(activityCreateSchema.parse({ ...fields, id: newId })),
      );
      // Mismos ids al reintentar: las subtareas ya creadas no se duplican.
      for (const step of steps)
        await keep(
          createSubtask(newId, { id: step.id, title: step.title, estimatedMinutes: null }),
        );
      if (steps.length > 0) void queryClient.invalidateQueries({ queryKey: ["subtasks"] });
      if (queued) throw queued;
      return created;
    },
    onError: (error) => {
      // Guardada en el teléfono: el aviso ya lo muestra el toast; se sale del formulario.
      if (!(error instanceof OfflineQueuedError)) return;
      void queryClient.invalidateQueries({ queryKey: ["offline-outbox"] });
      if (activity) onSaved();
      else navigation.goBack();
    },
    onSuccess: (updated) => {
      if (updated) queryClient.setQueryData(["activity", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      if (activity) onSaved();
      else navigation.goBack();
    },
  });

  const option = <T extends string>(labels: Record<T, string>) =>
    (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

  return (
    <View style={styles.form}>
      <FormSection title="Detalles">
        <Controller
          control={control}
          name="title"
          render={({ field }) => (
            <TextInput
              label="Título"
              mode="outlined"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.title}
              accessibilityLabel="Título de la tarea"
            />
          )}
        />
        {errors.title && <HelperText type="error">{errors.title.message}</HelperText>}
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <TextInput
              label="Descripción (opcional)"
              mode="outlined"
              multiline
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.description}
              accessibilityLabel="Descripción de la tarea"
            />
          )}
        />
        {errors.description && <HelperText type="error">{errors.description.message}</HelperText>}
      </FormSection>

      <FormSection title="Clasificación">
        <LabeledField label="Tipo">
          <Tabs
            // Un examen se clasifica como académica; se conserva si no se cambia.
            value={selectedKind === "exam" ? "academic_task" : selectedKind}
            onValueChange={(value) => {
              if (value === "academic_task" && selectedKind === "exam") return;
              setValue("kind", value);
            }}
            buttons={[...kindChoices]}
          />
        </LabeledField>
        <LabeledField label="Prioridad">
          <Tabs
            value={selectedPriority}
            onValueChange={(value) => setValue("priority", value)}
            buttons={option(priorityLabels)}
          />
        </LabeledField>
      </FormSection>

      <FormSection title="Fechas" hint={`Horas de ${profile.timeZone}.`}>
        <Controller
          control={control}
          name="deadlineLocal"
          render={({ field }) => (
            <DateTimeField
              label="Fecha límite"
              optional
              value={field.value}
              onChange={field.onChange}
              error={!!errors.deadlineLocal}
            />
          )}
        />
        {errors.deadlineLocal && (
          <HelperText type="error">{errors.deadlineLocal.message}</HelperText>
        )}
        <Controller
          control={control}
          name="startAfterLocal"
          render={({ field }) => (
            <DateTimeField
              label="Empezar desde"
              optional
              defaultTime="08:00"
              value={field.value}
              onChange={field.onChange}
              error={!!errors.startAfterLocal}
            />
          )}
        />
        {errors.startAfterLocal && (
          <HelperText type="error">{errors.startAfterLocal.message}</HelperText>
        )}
        <Controller
          control={control}
          name="estimatedMinutes"
          render={({ field }) => (
            <DurationField
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.estimatedMinutes}
            />
          )}
        />
        {errors.estimatedMinutes && (
          <HelperText type="error">{errors.estimatedMinutes.message}</HelperText>
        )}
      </FormSection>

      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión: la tarea se guarda en tu teléfono y se envía cuando vuelva el internet.
        </Text>
      )}
      {!activity && repeat === "none" && (
        <FormSection
          title="Subtareas (opcional)"
          hint="Divide la tarea en pasos más chicos. Después los marcas a medida que avanzas."
        >
          {steps.map((step, index) => (
            <View key={step.id} style={styles.stepRow}>
              <Text style={[styles.stepNumber, { color: theme.colors.onSurfaceVariant }]}>
                {index + 1}.
              </Text>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <IconButton
                icon="close"
                size={18}
                accessibilityLabel={`Quitar la subtarea ${step.title}`}
                onPress={() => setSteps((current) => current.filter((item) => item.id !== step.id))}
              />
            </View>
          ))}
          {steps.length < 20 && (
            <View style={styles.stepRow}>
              <TextInput
                mode="outlined"
                dense
                placeholder="Por ejemplo: leer el capítulo 3"
                value={stepDraft}
                onChangeText={setStepDraft}
                onSubmitEditing={addStep}
                returnKeyType="done"
                style={styles.stepInput}
                accessibilityLabel="Nueva subtarea"
              />
              <IconButton
                icon="plus"
                mode="contained"
                disabled={!stepDraft.trim()}
                accessibilityLabel="Agregar subtarea"
                onPress={addStep}
              />
            </View>
          )}
        </FormSection>
      )}
      {!activity && (
        <FormSection
          title="Repetir"
          hint="Crea una copia para cada día o semana hasta la fecha elegida."
        >
          <Tabs
            value={repeat}
            onValueChange={setRepeat}
            buttons={[
              { value: "none", label: "No" },
              { value: "daily", label: "Cada día" },
              { value: "weekly", label: "Cada semana" },
            ]}
          />
          {repeat !== "none" && (
            <DateField label="Hasta" value={repeatUntil} onChange={setRepeatUntil} />
          )}
        </FormSection>
      )}
      <Button
        mode="contained"
        loading={save.isPending}
        disabled={save.isPending || !!activity?.archivedAt}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
        contentStyle={sharedStyles.actionContent}
      >
        Guardar tarea
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepNumber: { width: 22 },
  stepTitle: { flex: 1 },
  stepInput: { flex: 1 },
  form: { gap: layout.sectionGap },
  message: { gap: layout.itemGap },
});
