import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { ActivityIndicator, Switch, Text, useTheme } from "react-native-paper";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/core/api/notifications";
import { getPreferences, updatePreferences } from "@/core/api/preferences";
import {
  enablePushDevice,
  getLocalPushDeviceId,
  PushPermissionBlockedError,
} from "@/core/push/push-registration";
import { layout } from "@/core/theme/layout";
import { clockToMinute, minuteToClock } from "@/features/availability/time";
import { userMessage } from "@/shared/errors";
import { FormSection, TimeField } from "@/shared/fields";
import { Button } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";

/** Anticipación de los avisos de entrega, en minutos. */
const leadChoices = [
  { value: "60", label: "1 hora" },
  { value: "180", label: "3 horas" },
  { value: "1440", label: "1 día" },
  { value: "2880", label: "2 días" },
] as const;
type Lead = (typeof leadChoices)[number]["value"];

/** El valor guardado más cercano entre las opciones visibles. */
function closestLead(minutes: number): Lead {
  return leadChoices.reduce((best, choice) =>
    Math.abs(Number(choice.value) - minutes) < Math.abs(Number(best.value) - minutes)
      ? choice
      : best,
  ).value;
}

export function AlertsScreen() {
  const notifications = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: getNotificationPreferences,
    retry: false,
  });
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: getPreferences,
    retry: false,
  });
  const device = useQuery({
    queryKey: ["local-push-device"],
    queryFn: getLocalPushDeviceId,
    retry: false,
  });
  const failed = notifications.isError ? notifications : preferences.isError ? preferences : null;
  return (
    <ScreenLayout header={{ title: "Avisos" }}>
      {(notifications.isPending || preferences.isPending) && (
        <ActivityIndicator accessibilityLabel="Cargando avisos" />
      )}
      {failed && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{userMessage(failed.error)}</Text>
          <Button onPress={() => void failed.refetch()}>Reintentar</Button>
        </View>
      )}
      {notifications.data && preferences.data && !device.isPending && (
        <AlertsForm
          key={`${notifications.data.version}-${preferences.data.version}-${Boolean(device.data)}`}
          notifications={notifications.data}
          preferences={preferences.data}
          hasDevice={Boolean(device.data)}
        />
      )}
    </ScreenLayout>
  );
}

function AlertsForm({
  notifications,
  preferences,
  hasDevice,
}: {
  notifications: Awaited<ReturnType<typeof getNotificationPreferences>>;
  preferences: Awaited<ReturnType<typeof getPreferences>>;
  hasDevice: boolean;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const [lead, setLead] = useState<Lead>(closestLead(notifications.deadlineLeadMinutes));
  const [quietStart, setQuietStart] = useState(minuteToClock(preferences.quietStartMinute));
  const [quietEnd, setQuietEnd] = useState(minuteToClock(preferences.quietEndMinute));
  const [enabled, setEnabled] = useState(preferences.notificationsEnabled);
  const [push, setPush] = useState((preferences.pushNotificationsEnabled ?? true) && hasDevice);
  const sameQuiet = quietStart === quietEnd;
  const save = useMutation({
    mutationFn: async () => {
      // Activar el push pide el permiso y registra este teléfono.
      if (enabled && push && !hasDevice) {
        await enablePushDevice();
        void queryClient.invalidateQueries({ queryKey: ["local-push-device"] });
        void queryClient.invalidateQueries({ queryKey: ["push-devices"] });
      }
      // Uno tras otro y solo lo que cambió: si el segundo falla, el primero ya
      // quedó guardado y en caché, y la pantalla se recarga con lo real.
      if (Number(lead) !== notifications.deadlineLeadMinutes)
        queryClient.setQueryData(
          ["notification-preferences"],
          await updateNotificationPreferences({
            deadlineLeadMinutes: Number(lead),
            blockLeadMinutes: notifications.blockLeadMinutes,
            riskCooldownMinutes: notifications.riskCooldownMinutes,
            version: notifications.version,
          }),
        );
      const quietStartMinute = clockToMinute(quietStart);
      const quietEndMinute = clockToMinute(quietEnd);
      if (
        enabled !== preferences.notificationsEnabled ||
        push !== preferences.pushNotificationsEnabled ||
        quietStartMinute !== preferences.quietStartMinute ||
        quietEndMinute !== preferences.quietEndMinute
      )
        queryClient.setQueryData(
          ["preferences"],
          await updatePreferences({
            minSessionMinutes: preferences.minSessionMinutes,
            maxSessionMinutes: preferences.maxSessionMinutes,
            maxDailyMinutes: preferences.maxDailyMinutes,
            notificationsEnabled: enabled,
            pushNotificationsEnabled: push,
            quietStartMinute,
            quietEndMinute,
            version: preferences.version,
          }),
        );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      void queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
    // Aquí se explica debajo del botón; no repetir el toast global.
    meta: { silent: true },
  });
  const blocked = save.error instanceof PushPermissionBlockedError;
  return (
    <View style={styles.form}>
      <FormSection title="Recibir avisos" hint="Recordatorios, alertas y mensajes del equipo.">
        <View style={styles.switchRow}>
          <Text variant="bodyLarge" style={styles.flex}>
            Avisos en la app
          </Text>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            accessibilityLabel="Avisos en la app"
          />
        </View>
        <View style={styles.switchRow}>
          <Text
            variant="bodyLarge"
            style={[styles.flex, !enabled && { color: theme.colors.onSurfaceDisabled }]}
          >
            Notificaciones en este teléfono
          </Text>
          <Switch
            value={enabled && push}
            disabled={!enabled}
            onValueChange={setPush}
            accessibilityLabel="Notificaciones en este teléfono"
          />
        </View>
      </FormSection>
      <FormSection
        title="Avísame antes de una entrega"
        hint="Recibirás un aviso con este tiempo de anticipación antes de cada fecha límite."
      >
        <Tabs value={lead} onValueChange={setLead} buttons={[...leadChoices]} />
      </FormSection>
      <FormSection
        title="No molestar"
        hint="En este horario no te llegarán avisos; se envían al terminar."
      >
        <View style={styles.row}>
          <View style={styles.flex}>
            <TimeField label="Desde" value={quietStart} onChange={setQuietStart} />
          </View>
          <View style={styles.flex}>
            <TimeField label="Hasta" value={quietEnd} onChange={setQuietEnd} error={sameQuiet} />
          </View>
        </View>
        {sameQuiet && (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            El inicio y el fin deben ser distintos.
          </Text>
        )}
      </FormSection>
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      {save.isSuccess && <Text accessibilityRole="alert">Avisos guardados.</Text>}
      {save.isError && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          {userMessage(save.error)}
        </Text>
      )}
      {blocked && (
        <Button icon="open-in-new" onPress={() => void Linking.openSettings()}>
          Abrir ajustes del teléfono
        </Button>
      )}
      <Button
        mode="contained"
        loading={save.isPending}
        disabled={offline || save.isPending || sameQuiet}
        onPress={() => save.mutate()}
      >
        Guardar
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.itemGap },
  form: { gap: layout.sectionGap },
  row: { flexDirection: "row", gap: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  flex: { flex: 1 },
});
