import { zodResolver } from "@hookform/resolvers/zod";
import { expandRecurrence } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { HelperText, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { createActivitySeries } from "@/core/api/activity-series";
import { listSubjects } from "@/core/api/subjects";
import { layout } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { DateField, DurationField, FormSection, LabeledField, SelectField } from "@/shared/fields";
import { Button, Menu, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";

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
      return createActivitySeries({
        id: requestIdentity.current.id,
        ...fields,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["activity-series"] });
      navigation.goBack();
    },
  });
  return (
    <ScreenLayout
      keyboardShouldPersistTaps="handled"
      header={{ title: "Nueva actividad recurrente" }}
    >
      <View style={styles.form}>
        <FormSection title="Detalles">
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
          {errors.title && <HelperText type="error">{errors.title.message}</HelperText>}
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
        </FormSection>

        <FormSection title="Clasificación">
          <SelectField
            label="Materia"
            value={subjectId}
            options={[
              { value: "", label: "Ninguna" },
              ...subjectItems.map((item) => ({ value: item.id, label: item.name })),
            ]}
            onChange={(value) => setValue("subjectId", value)}
            footer={
              subjects.hasNextPage && (
                <Menu.Item title="Cargar más" onPress={() => void subjects.fetchNextPage()} />
              )
            }
          />
          <LabeledField label="Tipo">
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <Tabs
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
          </LabeledField>
          <LabeledField label="Prioridad">
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Tabs
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
          </LabeledField>
        </FormSection>

        <FormSection title="Repetición">
          <LabeledField label="Frecuencia">
            <Controller
              control={control}
              name="frequency"
              render={({ field }) => (
                <Tabs
                  value={field.value}
                  onValueChange={field.onChange}
                  buttons={[
                    { value: "daily", label: "Diaria" },
                    { value: "weekly", label: "Semanal" },
                  ]}
                />
              )}
            />
          </LabeledField>
          {(["startOn", "throughOn"] as const).map((name) => (
            <View key={name} style={styles.field}>
              <Controller
                control={control}
                name={name}
                render={({ field }) => (
                  <DateField
                    label={name === "startOn" ? "Desde" : "Hasta"}
                    value={field.value}
                    onChange={field.onChange}
                    error={!!errors[name]}
                  />
                )}
              />
              {errors[name] && <HelperText type="error">{errors[name]?.message}</HelperText>}
            </View>
          ))}
          <Controller
            control={control}
            name="estimatedMinutes"
            render={({ field }) => (
              <DurationField
                label="¿Cuánto dura cada vez?"
                hint="Tiempo de trabajo de cada repetición."
                optional={false}
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
      </View>
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Conéctate para crear la serie.
        </Text>
      )}
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

const styles = StyleSheet.create({
  form: { gap: layout.sectionGap },
  field: { gap: 6 },
});
