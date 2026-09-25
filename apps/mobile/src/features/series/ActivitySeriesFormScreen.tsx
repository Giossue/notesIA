import { zodResolver } from "@hookform/resolvers/zod";
import { expandRecurrence } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import {
  Button,
  HelperText,
  Menu,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { createActivitySeries } from "@/core/api/activity-series";
import { listSubjects } from "@/core/api/subjects";
import type { RootStackParamList } from "@/navigation/types";
import { ScreenLayout } from "@/shared/ScreenLayout";

const formSchema = z
  .object({
    title: z.string().trim().min(1, "Escribe un título.").max(240),
    description: z.string().trim().max(10000),
    subjectId: z.union([z.literal(""), z.uuid()]),
    kind: z.enum(["academic_task", "personal", "routine"]),
    priority: z.enum(["low", "medium", "high", "critical"]),
    estimatedMinutes: z
      .string()
      .regex(/^\d+$/, "Escribe minutos enteros.")
      .refine((value) => Number(value) >= 1 && Number(value) <= 1440, {
        message: "Usa entre 1 y 1440 minutos.",
      }),
    frequency: z.enum(["daily", "weekly"]),
    startOn: z.iso.date(),
    throughOn: z.iso.date(),
  })
  .superRefine((value, context) => {
    try {
      expandRecurrence({
        frequency: value.frequency,
        startOn: value.startOn,
        throughOn: value.throughOn,
        timeZone: "UTC",
      });
    } catch {
      context.addIssue({
        code: "custom",
        path: ["throughOn"],
        message: "El rango debe generar entre 1 y 60 instancias y no superar 366 días.",
      });
    }
  });
type FormValues = z.infer<typeof formSchema>;

export function ActivitySeriesFormScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const requestIdentity = useRef({ fingerprint: "", id: uuidv4() });
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
      title: "",
      description: "",
      subjectId: "",
      kind: "routine",
      priority: "medium",
      estimatedMinutes: "30",
      frequency: "weekly",
      startOn: "",
      throughOn: "",
    },
  });
  const subjectId = watch("subjectId");
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const fields = {
        subjectId: values.subjectId || null,
        kind: values.kind,
        title: values.title.trim(),
        description: values.description.trim() || null,
        priority: values.priority,
        estimatedMinutes: Number(values.estimatedMinutes),
        frequency: values.frequency,
        startOn: values.startOn,
        throughOn: values.throughOn,
      };
      const fingerprint = JSON.stringify(fields);
      if (requestIdentity.current.fingerprint !== fingerprint)
        requestIdentity.current = { fingerprint, id: uuidv4() };
      return createActivitySeries({ id: requestIdentity.current.id, ...fields });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["activity-series"] });
      navigation.goBack();
    },
  });
  return (
    <ScreenLayout keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver">
        Volver
      </Button>
      <Text variant="headlineMedium">Nueva actividad recurrente</Text>
      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Título"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.title}
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
            mode="outlined"
            multiline
            label="Descripción (opcional)"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.description}
          />
        )}
      />
      <Menu
        visible={subjectMenuOpen}
        onDismiss={() => setSubjectMenuOpen(false)}
        anchor={
          <Button mode="outlined" onPress={() => setSubjectMenuOpen(true)}>
            Materia: {subjectItems.find((item) => item.id === subjectId)?.name ?? "Ninguna"}
          </Button>
        }
      >
        <Menu.Item
          title="Ninguna"
          onPress={() => {
            setValue("subjectId", "");
            setSubjectMenuOpen(false);
          }}
        />
        {subjectItems.map((item) => (
          <Menu.Item
            key={item.id}
            title={item.name}
            onPress={() => {
              setValue("subjectId", item.id);
              setSubjectMenuOpen(false);
            }}
          />
        ))}
        {subjects.hasNextPage && (
          <Menu.Item title="Cargar más" onPress={() => void subjects.fetchNextPage()} />
        )}
      </Menu>
      <Text variant="titleSmall">Tipo</Text>
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <SegmentedButtons
            value={field.value}
            onValueChange={field.onChange}
            buttons={[
              { value: "academic_task", label: "Académica" },
              { value: "personal", label: "Personal" },
              { value: "routine", label: "Rutina" },
            ]}
          />
        )}
      />
      <Text variant="titleSmall">Prioridad</Text>
      <Controller
        control={control}
        name="priority"
        render={({ field }) => (
          <SegmentedButtons
            value={field.value}
            onValueChange={field.onChange}
            buttons={[
              { value: "low", label: "Baja" },
              { value: "medium", label: "Media" },
              { value: "high", label: "Alta" },
              { value: "critical", label: "Crítica" },
            ]}
          />
        )}
      />
      <Controller
        control={control}
        name="estimatedMinutes"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Minutos por instancia"
            keyboardType="number-pad"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.estimatedMinutes}
          />
        )}
      />
      <HelperText type="error" visible={!!errors.estimatedMinutes}>
        {errors.estimatedMinutes?.message}
      </HelperText>
      <Text variant="titleSmall">Frecuencia</Text>
      <Controller
        control={control}
        name="frequency"
        render={({ field }) => (
          <SegmentedButtons
            value={field.value}
            onValueChange={field.onChange}
            buttons={[
              { value: "daily", label: "Diaria" },
              { value: "weekly", label: "Semanal" },
            ]}
          />
        )}
      />
      {(["startOn", "throughOn"] as const).map((name) => (
        <View key={name}>
          <Controller
            control={control}
            name={name}
            render={({ field }) => (
              <TextInput
                mode="outlined"
                label={name === "startOn" ? "Fecha inicial" : "Fecha final"}
                placeholder="2026-10-01"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={!!errors[name]}
              />
            )}
          />
          <HelperText type="error" visible={!!errors[name]}>
            {errors[name]?.message}
          </HelperText>
        </View>
      ))}
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Conéctate para crear la serie.
        </Text>
      )}
      {save.isError && <Text accessibilityRole="alert">{save.error.message}</Text>}
      <Button
        mode="contained"
        loading={save.isPending}
        disabled={offline || save.isPending}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
      >
        Crear serie e instancias
      </Button>
    </ScreenLayout>
  );
}
