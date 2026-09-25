import { zodResolver } from "@hookform/resolvers/zod";
import { type Activity, activityCreateSchema, type Profile } from "@notesia/contracts";
import { localDateTimeToUtc, utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, HelperText, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { createActivity, getActivity, updateActivity } from "@/core/api/activities";
import { getProfile } from "@/core/api/profile";
import { listSubjects } from "@/core/api/subjects";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { userMessage } from "@/shared/errors";
import {
  DateTimeField,
  DurationField,
  FormSection,
  LabeledField,
  SelectField,
} from "@/shared/fields";
import { Button, Menu, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";
import { ActivityActions } from "./ActivityActions";
import { ActivityHistory } from "./ActivityHistory";
import { ActivityProgressForm } from "./ActivityProgressForm";
import { SubtasksSection } from "./SubtasksSection";

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
    subjectId: z.union([z.literal(""), z.uuid()]),
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

const kindLabels = {
  academic_task: "Tarea académica",
  exam: "Examen",
  personal: "Personal",
  routine: "Rutina",
};
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

  return (
    <ScreenLayout
      keyboardShouldPersistTaps="handled"
      header={{ title: id ? "Actividad" : "Nueva actividad" }}
    >
      {(profile.isPending || (id && activity.isPending)) && (
        <ActivityIndicator accessibilityLabel="Cargando actividad" />
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
          <Button onPress={() => void activity.refetch()}>Reintentar actividad</Button>
        </View>
      )}
      {profile.data && (!id || activity.data) && (
        <ActivityForm
          key={`${activity.data?.id ?? "new"}-${activity.data?.version ?? 0}-${JSON.stringify(draft)}-${date}`}
          activity={activity.data}
          profile={profile.data}
          draft={draft}
          date={date}
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
}: {
  activity?: Activity;
  profile: Profile;
  draft?: { title?: string; description?: string; estimatedMinutes?: number };
  date?: string;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [newId] = useState(() => uuidv4());
  const subjects = useInfiniteQuery({
    queryKey: ["subjects", false],
    queryFn: ({ pageParam }) => listSubjects(false, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const subjectItems = subjects.data?.pages.flatMap((page) => page.items) ?? [];
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
      subjectId: activity?.subjectId ?? "",
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
  const selectedSubject = watch("subjectId");
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const fields = {
        kind: values.kind,
        title: values.title.trim(),
        description: values.description.trim() || null,
        priority: values.priority,
        subjectId: values.subjectId || null,
        startAfterAt: toUtc(values.startAfterLocal, profile.timeZone),
        deadlineAt: toUtc(values.deadlineLocal, profile.timeZone),
        estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : null,
      };
      if (activity)
        return updateActivity(activity.id, {
          ...fields,
          version: activity.version,
        });
      return createActivity(activityCreateSchema.parse({ ...fields, id: newId }));
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["activity", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      navigation.goBack();
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
              accessibilityLabel="Título de la actividad"
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
              accessibilityLabel="Descripción de la actividad"
            />
          )}
        />
        {errors.description && <HelperText type="error">{errors.description.message}</HelperText>}
      </FormSection>

      <FormSection title="Clasificación">
        <SelectField
          label="Tipo"
          value={selectedKind}
          options={option(kindLabels)}
          onChange={(value) => setValue("kind", value)}
        />
        <SelectField
          label="Materia"
          value={selectedSubject}
          options={[
            { value: "", label: "Ninguna" },
            ...subjectItems.map((item) => ({ value: item.id, label: item.name })),
          ]}
          onChange={(value) => setValue("subjectId", value)}
          footer={
            subjects.hasNextPage && (
              <Menu.Item
                title="Cargar más materias"
                onPress={() => void subjects.fetchNextPage()}
              />
            )
          }
        />
        {subjects.isError && (
          <View style={styles.message}>
            <Text accessibilityRole="alert">{userMessage(subjects.error)}</Text>
            <Button onPress={() => void subjects.refetch()}>Reintentar materias</Button>
          </View>
        )}
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
          Sin conexión. La actividad quedará pendiente en este dispositivo.
        </Text>
      )}
      <Button
        mode="contained"
        loading={save.isPending}
        disabled={save.isPending || !!activity?.archivedAt}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
        contentStyle={sharedStyles.actionContent}
      >
        Guardar actividad
      </Button>
      {activity && <ActivityProgressForm activity={activity} />}
      {activity && <ActivityActions activity={activity} offline={offline} />}
      {activity && <SubtasksSection activity={activity} offline={offline} />}
      {activity && <ActivityHistory id={activity.id} />}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: layout.sectionGap },
  message: { gap: layout.itemGap },
});
