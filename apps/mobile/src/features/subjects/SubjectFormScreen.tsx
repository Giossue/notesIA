import { zodResolver } from "@hookform/resolvers/zod";
import { type Subject, subjectColorSchema } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, HelperText, Portal, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { listAcademicPeriods } from "@/core/api/academic-periods";
import { ApiError } from "@/core/api/client";
import { createSubject, getSubject, setSubjectArchived, updateSubject } from "@/core/api/subjects";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { userMessage } from "@/shared/errors";
import { FormSection, SelectField } from "@/shared/fields";
import { Button, Dialog, Menu, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { SubjectColorPicker } from "./SubjectColorPicker";

const formSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre de la materia.").max(160),
  periodId: z.union([z.literal(""), z.uuid()]),
  colorToken: subjectColorSchema,
});
type FormValues = z.infer<typeof formSchema>;

export function SubjectFormScreen({ id }: { id?: string }) {
  const subject = useQuery({
    queryKey: ["subject", id],
    queryFn: () => getSubject(id ?? ""),
    enabled: !!id,
    retry: false,
  });

  return (
    <ScreenLayout
      keyboardShouldPersistTaps="handled"
      header={{ title: id ? "Editar materia" : "Nueva materia" }}
    >
      {id && subject.isPending && <ActivityIndicator accessibilityLabel="Cargando materia" />}
      {id && subject.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(subject.error)}</Text>
          <Button onPress={() => void subject.refetch()}>Reintentar</Button>
        </View>
      )}
      {(!id || subject.data) && (
        <SubjectForm key={subject.data?.version ?? "new"} subject={subject.data} />
      )}
    </ScreenLayout>
  );
}

function SubjectForm({ subject }: { subject?: Subject }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [newId] = useState(() => uuidv4());
  const [confirmArchive, setConfirmArchive] = useState(false);
  const periods = useInfiniteQuery({
    queryKey: ["academic-periods", false],
    queryFn: ({ pageParam }) => listAcademicPeriods(false, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const periodItems = periods.data?.pages.flatMap((page) => page.items) ?? [];
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: subject?.name ?? "",
      periodId: subject?.periodId ?? "",
      colorToken: subject?.colorToken ?? "primary",
    },
  });
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const fields = {
        name: values.name.trim(),
        periodId: values.periodId || null,
        colorToken: values.colorToken,
      };
      return subject
        ? updateSubject(subject.id, { ...fields, version: subject.version })
        : createSubject({ id: newId, ...fields });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["subject", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["subjects"] });
      navigation.goBack();
    },
    onError: (error) => {
      // El toast global ya muestra el mensaje; aquí solo se marca el campo.
      if (error instanceof ApiError && error.code === "SUBJECT_NAME_CONFLICT")
        setError("name", { type: "server" }, { shouldFocus: true });
    },
  });
  const archive = useMutation({
    mutationFn: () =>
      setSubjectArchived(subject?.id ?? "", subject?.version ?? 0, !subject?.archivedAt),
    onSuccess: (updated) => {
      queryClient.setQueryData(["subject", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["subjects"] });
      setConfirmArchive(false);
      navigation.goBack();
    },
    onError: () => setConfirmArchive(false),
  });

  return (
    <View style={styles.fields}>
      <FormSection title="Detalles">
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <TextInput
              label="Nombre"
              mode="outlined"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.name}
              accessibilityLabel="Nombre de la materia"
            />
          )}
        />
        {errors.name?.message && <HelperText type="error">{errors.name.message}</HelperText>}
        <Controller
          control={control}
          name="periodId"
          render={({ field }) => (
            <SelectField
              label="Periodo"
              value={field.value}
              options={[
                { value: "", label: "Sin periodo" },
                ...periodItems.map((period) => ({ value: period.id, label: period.name })),
              ]}
              onChange={field.onChange}
              footer={
                periods.hasNextPage && (
                  <Menu.Item
                    title="Cargar más periodos"
                    onPress={() => void periods.fetchNextPage()}
                  />
                )
              }
            />
          )}
        />
        {periods.isError && <Text accessibilityRole="alert">{userMessage(periods.error)}</Text>}
      </FormSection>
      <FormSection title="Color">
        <Controller
          control={control}
          name="colorToken"
          render={({ field }) => (
            <SubjectColorPicker value={field.value} onChange={field.onChange} />
          )}
        />
      </FormSection>
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      <Button
        mode="contained"
        loading={save.isPending}
        disabled={offline || save.isPending || !!subject?.archivedAt}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
        contentStyle={sharedStyles.actionContent}
      >
        Guardar materia
      </Button>
      {subject && (
        <Button
          mode="outlined"
          icon={subject.archivedAt ? "archive-arrow-up" : "archive-outline"}
          disabled={offline || archive.isPending}
          onPress={() => setConfirmArchive(true)}
          contentStyle={sharedStyles.actionContent}
        >
          {subject.archivedAt ? "Restaurar materia" : "Archivar materia"}
        </Button>
      )}
      <Portal>
        <Dialog visible={confirmArchive} onDismiss={() => setConfirmArchive(false)}>
          <Dialog.Title>
            {subject?.archivedAt ? "Restaurar materia" : "Archivar materia"}
          </Dialog.Title>
          <Dialog.Content>
            <Text>
              {subject?.archivedAt
                ? "La materia volverá a la lista de activas."
                : "La materia dejará de aparecer entre las activas. Podrás restaurarla después."}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmArchive(false)}>Cancelar</Button>
            <Button loading={archive.isPending} onPress={() => archive.mutate()}>
              Confirmar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: layout.sectionGap },
  message: { gap: layout.itemGap },
});
