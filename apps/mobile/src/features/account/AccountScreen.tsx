import { zodResolver } from "@hookform/resolvers/zod";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { Share, StyleSheet, View } from "react-native";
import { ActivityIndicator, Divider, HelperText, Text, useTheme } from "react-native-paper";
import { z } from "zod";
import {
  cancelAccountDeletion,
  exportAccount,
  getDeletionRequest,
  requestAccountDeletion,
} from "@/core/api/account";
import { layout } from "@/core/theme/layout";
import { userMessage } from "@/shared/errors";
import { Button, Card, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";

const passwordSchema = z.object({
  password: z.string().min(1, "Confirma tu contraseña."),
});
const deletionSchema = passwordSchema.extend({
  confirmation: z.literal("ELIMINAR", "Escribe ELIMINAR."),
});
const cancelSchema = passwordSchema.extend({
  confirmation: z.literal("CANCELAR", "Escribe CANCELAR."),
});
type PasswordValues = z.infer<typeof passwordSchema>;
type DeletionValues = z.infer<typeof deletionSchema>;
type CancelValues = z.infer<typeof cancelSchema>;

export function AccountScreen() {
  const deletion = useQuery({
    queryKey: ["account-deletion"],
    queryFn: getDeletionRequest,
    retry: false,
  });
  return (
    <ScreenLayout keyboardShouldPersistTaps="handled" header={{ title: "Datos y cuenta" }}>
      <ExportForm />
      <Divider />
      {deletion.isPending && (
        <ActivityIndicator accessibilityLabel="Consultando eliminación de cuenta" />
      )}
      {deletion.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{userMessage(deletion.error)}</Text>
          <Button onPress={() => void deletion.refetch()}>Reintentar</Button>
        </View>
      )}
      {!deletion.isError && <DeletionPanel status={deletion.data ?? null} />}
    </ScreenLayout>
  );
}

function ExportForm() {
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });
  const mutation = useMutation({
    mutationFn: ({ password }: PasswordValues) => exportAccount(password),
    onSuccess: async (content) => {
      reset();
      await Share.share({ title: "Exportación de NotesIA", message: content });
    },
  });
  return (
    <Card mode="contained">
      <Card.Content style={styles.group}>
        <Text variant="titleMedium">Exportar mis datos</Text>
        <Text>
          Genera tus datos en JSON y abre el menú del sistema para guardarlos o compartirlos.
        </Text>
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <TextInput
              mode="outlined"
              label="Contraseña actual"
              secureTextEntry
              autoComplete="current-password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.password}
            />
          )}
        />
        <HelperText type="error" visible={!!errors.password}>
          {errors.password?.message}
        </HelperText>
        {offline && (
          <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para exportar.</Text>
        )}
        <Button
          mode="contained"
          loading={mutation.isPending}
          disabled={offline || mutation.isPending}
          onPress={() => void handleSubmit((values) => mutation.mutate(values))()}
        >
          Exportar datos
        </Button>
      </Card.Content>
    </Card>
  );
}

function DeletionPanel({ status }: { status: Awaited<ReturnType<typeof getDeletionRequest>> }) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const requestForm = useForm<DeletionValues>({
    resolver: zodResolver(deletionSchema),
    defaultValues: { password: "", confirmation: "" as "ELIMINAR" },
  });
  const cancelForm = useForm<CancelValues>({
    resolver: zodResolver(cancelSchema),
    defaultValues: { password: "", confirmation: "" as "CANCELAR" },
  });
  const request = useMutation({
    mutationFn: (values: DeletionValues) =>
      requestAccountDeletion(values.password, values.confirmation),
    onSuccess: (updated) => queryClient.setQueryData(["account-deletion"], updated),
  });
  const cancel = useMutation({
    mutationFn: (values: CancelValues) =>
      cancelAccountDeletion(values.password, values.confirmation),
    onSuccess: () => queryClient.setQueryData(["account-deletion"], null),
  });
  if (status) {
    return (
      <Card mode="contained">
        <Card.Content style={styles.group}>
          <Text variant="titleMedium">Eliminación solicitada</Text>
          <Text>Estado: {status.status === "pending" ? "pendiente" : "bloqueada"}</Text>
          <Text>Programada para: {new Date(status.executeAt).toLocaleString()}</Text>
          <Text>Para cancelarla, escribe CANCELAR y confirma tu contraseña.</Text>
          <Controller
            control={cancelForm.control}
            name="confirmation"
            render={({ field }) => (
              <TextInput
                mode="outlined"
                label="Confirmación"
                autoCapitalize="characters"
                value={field.value}
                onChangeText={field.onChange}
                error={!!cancelForm.formState.errors.confirmation}
              />
            )}
          />
          <HelperText type="error" visible={!!cancelForm.formState.errors.confirmation}>
            {cancelForm.formState.errors.confirmation?.message}
          </HelperText>
          <Controller
            control={cancelForm.control}
            name="password"
            render={({ field }) => (
              <TextInput
                mode="outlined"
                label="Contraseña actual"
                secureTextEntry
                value={field.value}
                onChangeText={field.onChange}
                error={!!cancelForm.formState.errors.password}
              />
            )}
          />
          <HelperText type="error" visible={!!cancelForm.formState.errors.password}>
            {cancelForm.formState.errors.password?.message}
          </HelperText>
          <Button
            loading={cancel.isPending}
            disabled={offline || cancel.isPending}
            onPress={() => void cancelForm.handleSubmit((values) => cancel.mutate(values))()}
          >
            Cancelar eliminación
          </Button>
        </Card.Content>
      </Card>
    );
  }
  return (
    <Card mode="contained">
      <Card.Content style={styles.group}>
        <Text variant="titleMedium">Eliminar mi cuenta</Text>
        <Text>
          La solicitud usa el periodo de espera configurado y puede cancelarse antes de su
          ejecución.
        </Text>
        <Text>Escribe ELIMINAR y confirma tu contraseña.</Text>
        <Controller
          control={requestForm.control}
          name="confirmation"
          render={({ field }) => (
            <TextInput
              mode="outlined"
              label="Confirmación"
              autoCapitalize="characters"
              value={field.value}
              onChangeText={field.onChange}
              error={!!requestForm.formState.errors.confirmation}
            />
          )}
        />
        <HelperText type="error" visible={!!requestForm.formState.errors.confirmation}>
          {requestForm.formState.errors.confirmation?.message}
        </HelperText>
        <Controller
          control={requestForm.control}
          name="password"
          render={({ field }) => (
            <TextInput
              mode="outlined"
              label="Contraseña actual"
              secureTextEntry
              value={field.value}
              onChangeText={field.onChange}
              error={!!requestForm.formState.errors.password}
            />
          )}
        />
        <HelperText type="error" visible={!!requestForm.formState.errors.password}>
          {requestForm.formState.errors.password?.message}
        </HelperText>
        {offline && (
          <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para continuar.</Text>
        )}
        <Button
          mode="outlined"
          loading={request.isPending}
          disabled={offline || request.isPending}
          textColor={theme.colors.error}
          onPress={() => void requestForm.handleSubmit((values) => request.mutate(values))()}
        >
          Solicitar eliminación
        </Button>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.fieldGap } });
