import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Icon, Portal, Text, useTheme } from "react-native-paper";
import {
  cancelAccountDeletion,
  exportAccountExcel,
  type getDeletionRequest,
  requestAccountDeletion,
} from "@/core/api/account";
import { shareFile } from "@/core/files/share-file";
import { layout } from "@/core/theme/layout";
import { userMessage } from "@/shared/errors";
import { Button, Card, Dialog, TextInput } from "@/shared/paper";

function ActionCard({
  icon,
  title,
  text,
  danger,
  children,
}: {
  icon: string;
  title: string;
  text: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const tint = danger ? theme.colors.error : theme.colors.primary;
  return (
    <Card mode="contained">
      <Card.Content style={styles.card}>
        <View style={styles.head}>
          <View
            style={[
              styles.icon,
              {
                backgroundColor: danger
                  ? theme.colors.errorContainer
                  : theme.colors.primaryContainer,
              },
            ]}
          >
            <Icon source={icon} size={22} color={tint} />
          </View>
          <Text variant="titleMedium" style={styles.bold}>
            {title}
          </Text>
        </View>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>{text}</Text>
        {children}
      </Card.Content>
    </Card>
  );
}

/** Modal que pide la contraseña antes de una acción sensible. */
function PasswordDialog({
  visible,
  title,
  text,
  confirmLabel,
  danger,
  loading,
  error,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  loading: boolean;
  error?: string;
  onConfirm(password: string): void;
  onDismiss(): void;
}) {
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [password, setPassword] = useState("");
  const [visiblePassword, setVisiblePassword] = useState(false);
  const close = () => {
    if (loading) return;
    setPassword("");
    onDismiss();
  };
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={close}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content style={styles.group}>
          <Text>{text}</Text>
          <TextInput
            mode="outlined"
            label="Contraseña"
            secureTextEntry={!visiblePassword}
            autoComplete="current-password"
            value={password}
            onChangeText={setPassword}
            error={!!error}
            right={
              <TextInput.Icon
                icon={visiblePassword ? "eye-off" : "eye"}
                onPress={() => setVisiblePassword(!visiblePassword)}
                accessibilityLabel={visiblePassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              />
            }
          />
          {error && (
            <Text variant="bodySmall" style={{ color: theme.colors.error }}>
              {error}
            </Text>
          )}
          {offline && (
            <Text variant="bodySmall" style={{ color: theme.colors.error }}>
              Sin conexión. Conéctate para continuar.
            </Text>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={close} disabled={loading}>
            Cancelar
          </Button>
          <Button
            mode="contained"
            buttonColor={danger ? theme.colors.error : undefined}
            textColor={danger ? theme.colors.onError : undefined}
            loading={loading}
            disabled={loading || offline || !password}
            onPress={() => onConfirm(password)}
          >
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

export function ExportCard() {
  const [open, setOpen] = useState(false);
  const exporter = useMutation({
    mutationFn: async (password: string) => {
      const file = await exportAccountExcel(password);
      await shareFile(file.base64, file.fileName, file.mimeType, "Guardar mis datos de NotesIA");
    },
    onSuccess: () => setOpen(false),
    // El error se muestra dentro del modal.
    meta: { silent: true },
  });
  return (
    <ActionCard
      icon="download-outline"
      title="Exportar mis datos"
      text="Descarga un Excel con toda tu información: actividades, eventos, tiempo registrado, avisos y más."
    >
      <Button
        mode="contained"
        onPress={() => {
          exporter.reset();
          setOpen(true);
        }}
      >
        Exportar a Excel
      </Button>
      <PasswordDialog
        key={open ? "abierto" : "cerrado"}
        visible={open}
        title="Exportar mis datos"
        text="Por seguridad, confirma tu contraseña. Luego podrás guardar el archivo o compartirlo."
        confirmLabel="Exportar"
        loading={exporter.isPending}
        error={exporter.isError ? userMessage(exporter.error) : undefined}
        onConfirm={(password) => exporter.mutate(password)}
        onDismiss={() => setOpen(false)}
      />
    </ActionCard>
  );
}

export function DeletionCard({
  status,
}: {
  status: Awaited<ReturnType<typeof getDeletionRequest>>;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const request = useMutation({
    mutationFn: (password: string) => requestAccountDeletion(password, "ELIMINAR"),
    onSuccess: (updated) => {
      queryClient.setQueryData(["account-deletion"], updated);
      setOpen(false);
    },
    meta: { silent: true },
  });
  const cancel = useMutation({
    mutationFn: (password: string) => cancelAccountDeletion(password, "CANCELAR"),
    onSuccess: () => {
      queryClient.setQueryData(["account-deletion"], null);
      setOpen(false);
    },
    meta: { silent: true },
  });
  const openDialog = () => {
    request.reset();
    cancel.reset();
    setOpen(true);
  };

  if (status) {
    return (
      <ActionCard
        icon="clock-outline"
        title="Eliminación programada"
        text={`Tu cuenta y todos tus datos se eliminarán el ${new Date(
          status.executeAt,
        ).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}${
          status.status === "pending" ? "" : " (en espera de revisión)"
        }. Hasta entonces puedes cancelarlo.`}
        danger
      >
        <Button mode="outlined" onPress={openDialog}>
          Cancelar eliminación
        </Button>
        <PasswordDialog
          key={open ? "abierto" : "cerrado"}
          visible={open}
          title="Cancelar eliminación"
          text="Confirma tu contraseña para conservar tu cuenta."
          confirmLabel="Conservar mi cuenta"
          loading={cancel.isPending}
          error={cancel.isError ? userMessage(cancel.error) : undefined}
          onConfirm={(password) => cancel.mutate(password)}
          onDismiss={() => setOpen(false)}
        />
      </ActionCard>
    );
  }
  return (
    <ActionCard
      icon="delete-outline"
      title="Eliminar mi cuenta"
      text="Se borrarán tu cuenta y todos tus datos. Tendrás un plazo para arrepentirte antes de que se eliminen."
      danger
    >
      <DangerButton onPress={openDialog} />
      <PasswordDialog
        key={open ? "abierto" : "cerrado"}
        visible={open}
        title="¿Eliminar tu cuenta?"
        text="Se programará la eliminación de tu cuenta y de todos tus datos. Podrás cancelarla durante el plazo de espera. Confirma tu contraseña para continuar."
        confirmLabel="Eliminar"
        danger
        loading={request.isPending}
        error={request.isError ? userMessage(request.error) : undefined}
        onConfirm={(password) => request.mutate(password)}
        onDismiss={() => setOpen(false)}
      />
    </ActionCard>
  );
}

function DangerButton({ onPress }: { onPress(): void }) {
  const theme = useTheme();
  return (
    <Button
      mode="outlined"
      textColor={theme.colors.error}
      style={{ borderColor: theme.colors.error }}
      onPress={onPress}
    >
      Eliminar mi cuenta
    </Button>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.fieldGap },
  card: { gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  bold: { fontWeight: "700" },
});
