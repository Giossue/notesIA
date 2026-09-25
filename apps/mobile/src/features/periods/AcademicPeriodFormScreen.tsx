import { zodResolver } from "@hookform/resolvers/zod";
import { academicPeriodCreateSchema, type academicPeriodSchema } from "@notesia/contracts";
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
import type { z } from "zod";
import {
  createAcademicPeriod,
  getAcademicPeriod,
  setAcademicPeriodArchived,
  updateAcademicPeriod,
} from "@/core/api/academic-periods";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { ScreenLayout } from "@/shared/ScreenLayout";

const formSchema = academicPeriodCreateSchema.omit({ id: true });
type FormValues = z.infer<typeof formSchema>;
type AcademicPeriod = z.infer<typeof academicPeriodSchema>;

export function AcademicPeriodFormScreen({ id }: { id?: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const period = useQuery({
    queryKey: ["academic-period", id],
    queryFn: () => getAcademicPeriod(id ?? ""),
    enabled: !!id,
    retry: false,
  });
  return (
    <ScreenLayout keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver">
        Volver
      </Button>
      <Text variant="headlineMedium">{id ? "Editar periodo" : "Nuevo periodo"}</Text>
      {id && period.isPending && <ActivityIndicator accessibilityLabel="Cargando periodo" />}
      {period.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{period.error.message}</Text>
          <Button onPress={() => void period.refetch()}>Reintentar</Button>
        </View>
      )}
      {(!id || period.data) && (
        <AcademicPeriodForm key={period.data?.version ?? "new"} period={period.data} />
      )}
    </ScreenLayout>
  );
}

function AcademicPeriodForm({ period }: { period?: AcademicPeriod }) {
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
      name: period?.name ?? "",
      startsOn: period?.startsOn ?? "",
      endsOn: period?.endsOn ?? "",
    },
  });
  const save = useMutation({
    mutationFn: (values: FormValues) =>
      period
        ? updateAcademicPeriod(period.id, { ...values, version: period.version })
        : createAcademicPeriod({ id: newId, ...values }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["academic-period", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["academic-periods"] });
      navigation.goBack();
    },
  });
  const archive = useMutation({
    mutationFn: () =>
      setAcademicPeriodArchived(period?.id ?? "", period?.version ?? 0, !period?.archivedAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["academic-periods"] });
      setConfirmArchive(false);
      navigation.goBack();
    },
  });

  return (
    <View style={styles.group}>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Nombre"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.name}
            accessibilityLabel="Nombre del periodo"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.name}>
        {errors.name?.message}
      </HelperText>
      <Controller
        control={control}
        name="startsOn"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Fecha inicial"
            placeholder="2026-10-01"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.startsOn}
            accessibilityLabel="Fecha inicial en formato año mes día"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.startsOn}>
        {errors.startsOn?.message}
      </HelperText>
      <Controller
        control={control}
        name="endsOn"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label="Fecha final"
            placeholder="2027-02-28"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.endsOn}
            accessibilityLabel="Fecha final en formato año mes día"
          />
        )}
      />
      <HelperText type="error" visible={!!errors.endsOn}>
        {errors.endsOn?.message}
      </HelperText>
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      {save.isError && <Text accessibilityRole="alert">{save.error.message}</Text>}
      <Button
        mode="contained"
        loading={save.isPending}
        disabled={offline || save.isPending || !!period?.archivedAt}
        onPress={() => void handleSubmit((values) => save.mutate(values))()}
        contentStyle={sharedStyles.actionContent}
      >
        Guardar periodo
      </Button>
      {period && (
        <Button mode="outlined" disabled={offline} onPress={() => setConfirmArchive(true)}>
          {period.archivedAt ? "Restaurar periodo" : "Archivar periodo"}
        </Button>
      )}
      {archive.isError && <Text accessibilityRole="alert">{archive.error.message}</Text>}
      <Portal>
        <Dialog visible={confirmArchive} onDismiss={() => setConfirmArchive(false)}>
          <Dialog.Title>
            {period?.archivedAt ? "Restaurar periodo" : "Archivar periodo"}
          </Dialog.Title>
          <Dialog.Content>
            <Text>Confirma el cambio del periodo académico.</Text>
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

const styles = StyleSheet.create({ group: { gap: layout.fieldGap } });
