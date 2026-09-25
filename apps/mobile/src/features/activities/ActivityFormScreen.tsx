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
import {
  ActivityIndicator,
  Button,
  HelperText,
  Menu,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { createActivity, getActivity, updateActivity } from "@/core/api/activities";
import { getProfile } from "@/core/api/profile";
import { listSubjects } from "@/core/api/subjects";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { ScreenLayout } from "@/shared/ScreenLayout";
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
const formSchema = z.object({
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
});
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
}: {
  id?: string;
  draft?: { title?: string; description?: string; estimatedMinutes?: number };
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const activity = useQuery({
    queryKey: ["activity", id],
    queryFn: () => getActivity(id ?? ""),
    enabled: !!id,
    retry: false,
  });

  return (
    <ScreenLayout keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver">
        Volver
      </Button>
      <Text variant="headlineMedium">{id ? "Actividad" : "Nueva actividad"}</Text>
      {(profile.isPending || (id && activity.isPending)) && (
        <ActivityIndicator accessibilityLabel="Cargando actividad" />
      )}
      {profile.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{profile.error.message}</Text>
          <Button onPress={() => void profile.refetch()}>Reintentar perfil</Button>
        </View>
      )}
      {id && activity.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{activity.error.message}</Text>
          <Button onPress={() => void activity.refetch()}>Reintentar actividad</Button>
        </View>
      )}
      {profile.data && (!id || activity.data) && (
        <ActivityForm
          key={`${activity.data?.id ?? "new"}-${activity.data?.version ?? 0}-${JSON.stringify(draft)}`}
          activity={activity.data}
          profile={profile.data}
          draft={draft}
        />
      )}
    </ScreenLayout>
  );
}

function ActivityForm({
  activity,
  profile,
  draft,
}: {
  activity?: Activity;
  profile: Profile;
  draft?: { title?: string; description?: string; estimatedMinutes?: number };
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [newId] = useState(() => uuidv4());
  const [menu, setMenu] = useState<"kind" | "priority" | "subject" | null>(null);
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
      if (activity) return updateActivity(activity.id, { ...fields, version: activity.version });
      return createActivity(activityCreateSchema.parse({ ...fields, id: newId }));
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["activity", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      navigation.goBack();
    },
  });

  return (
    <View style={styles.fields}>
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
      <HelperText type="error" visible={!!errors.title}>
        {errors.title?.message}
      </HelperText>
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
      <HelperText type="error" visible={!!errors.description}>
        {errors.description?.message}
      </HelperText>
      <Menu
        visible={menu === "kind"}
        onDismiss={() => setMenu(null)}
        anchor={
          <Button mode="outlined" onPress={() => setMenu("kind")}>
            Tipo: {kindLabels[selectedKind]}
          </Button>
        }
      >
        {Object.entries(kindLabels).map(([value, label]) => (
          <Menu.Item
            key={value}
            title={label}
            onPress={() => {
              setValue("kind", value as FormValues["kind"]);
              setMenu(null);
            }}
          />
        ))}
      </Menu>
      <Menu
        visible={menu === "priority"}
        onDismiss={() => setMenu(null)}
        anchor={
          <Button mode="outlined" onPress={() => setMenu("priority")}>
            Prioridad: {priorityLabels[selectedPriority]}
          </Button>
        }
      >
        {Object.entries(priorityLabels).map(([value, label]) => (
          <Menu.Item
            key={value}
            title={label}
            onPress={() => {
              setValue("priority", value as FormValues["priority"]);
              setMenu(null);
            }}
          />
        ))}
      </Menu>
      <Menu
        visible={menu === "subject"}
        onDismiss={() => setMenu(null)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setMenu("subject")}
            accessibilityLabel="Elegir materia"
          >
            Materia: {subjectItems.find((item) => item.id === selectedSubject)?.name ?? "Ninguna"}
          </Button>
        }
      >
        <Menu.Item
          title="Ninguna"
          onPress={() => {
            setValue("subjectId", "");
            setMenu(null);
          }}
        />
        {subjectItems.map((item) => (
          <Menu.Item
            key={item.id}
            title={item.name}
            onPress={() => {
              setValue("subjectId", item.id);
              setMenu(null);
            }}
          />
        ))}
        {subjects.hasNextPage && (
          <Menu.Item title="Cargar más materias" onPress={() => void subjects.fetchNextPage()} />
        )}
      </Menu>
      {subjects.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{subjects.error.message}</Text>
          <Button onPress={() => void subjects.refetch()}>Reintentar materias</Button>
        </View>
      )}
      <Text variant="bodySmall">Fechas en {profile.timeZone}. Formato: AAAA-MM-DD HH:mm.</Text>
      <Controller
        control={control}
        name="startAfterLocal"
        render={({ field }) => (
          <TextInput
            label="Inicio mínimo (opcional)"
            mode="outlined"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.startAfterLocal}
            placeholder="2026-09-23 08:00"
            accessibilityLabel="Inicio mínimo local"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.startAfterLocal}>
        {errors.startAfterLocal?.message}
      </HelperText>
      <Controller
        control={control}
        name="deadlineLocal"
        render={({ field }) => (
          <TextInput
            label="Fecha límite (opcional)"
            mode="outlined"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.deadlineLocal}
            placeholder="2026-09-25 23:59"
            accessibilityLabel="Fecha límite local"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.deadlineLocal}>
        {errors.deadlineLocal?.message}
      </HelperText>
      <Controller
        control={control}
        name="estimatedMinutes"
        render={({ field }) => (
          <TextInput
            label="Duración estimada en minutos (opcional)"
            mode="outlined"
            keyboardType="number-pad"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.estimatedMinutes}
            accessibilityLabel="Duración estimada en minutos"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.estimatedMinutes}>
        {errors.estimatedMinutes?.message}
      </HelperText>
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. La actividad quedará pendiente en este dispositivo.
        </Text>
      )}
      {save.isError && <Text accessibilityRole="alert">{save.error.message}</Text>}
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
  fields: { gap: layout.fieldGap },
  message: { gap: layout.itemGap },
});
