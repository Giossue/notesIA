import { zodResolver } from "@hookform/resolvers/zod";
import { type Subject, subjectColorSchema } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Dialog,
  HelperText,
  Portal,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { createSubject, getSubject, setSubjectArchived, updateSubject } from "@/core/api/subjects";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { SubjectColorPicker } from "./SubjectColorPicker";

const formSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre de la materia.").max(160),
  code: z.string().trim().max(40),
  colorToken: subjectColorSchema,
});
type FormValues = z.infer<typeof formSchema>;

export function SubjectFormScreen({ id }: { id?: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const subject = useQuery({
    queryKey: ["subject", id],
    queryFn: () => getSubject(id ?? ""),
    enabled: !!id,
    retry: false,
  });

  return (
    <ScreenLayout keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver">
        Volver
      </Button>
      <Text variant="headlineMedium">{id ? "Editar materia" : "Nueva materia"}</Text>
      {id && subject.isPending && <ActivityIndicator accessibilityLabel="Cargando materia" />}
      {id && subject.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{subject.error.message}</Text>
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
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: subject?.name ?? "",
      code: subject?.code ?? "",
      colorToken: subject?.colorToken ?? "primary",
    },
  });
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const fields = {
        name: values.name.trim(),
        code: values.code.trim() || null,
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
  });

  return (
    <View style={styles.fields}>
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
      <HelperText type="error" visible={!!errors.name}>
        {errors.name?.message}
      </HelperText>
      <Controller
        control={control}
        name="code"
        render={({ field }) => (
          <TextInput
            label="Código (opcional)"
            mode="outlined"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.code}
            accessibilityLabel="Código de la materia"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.code}>
        {errors.code?.message}
      </HelperText>
      <Text variant="titleSmall">Color de la materia</Text>
      <Controller
        control={control}
        name="colorToken"
        render={({ field }) => <SubjectColorPicker value={field.value} onChange={field.onChange} />}
      />
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      {save.isError && <Text accessibilityRole="alert">{save.error.message}</Text>}
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
      {archive.isError && <Text accessibilityRole="alert">{archive.error.message}</Text>}
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
            {archive.isError && <Text accessibilityRole="alert">{archive.error.message}</Text>}
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
  fields: { gap: layout.fieldGap },
  message: { gap: layout.itemGap },
});
