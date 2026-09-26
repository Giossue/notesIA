import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/core/api/notifications";
import { getPreferences, updatePreferences } from "@/core/api/preferences";
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
      {notifications.data && preferences.data && (
        <AlertsForm
          key={`${notifications.data.version}-${preferences.data.version}`}
          notifications={notifications.data}
          preferences={preferences.data}
        />
      )}
    </ScreenLayout>
  );
}

function AlertsForm({
  notifications,
  preferences,
}: {
  notifications: Awaited<ReturnType<typeof getNotificationPreferences>>;
  preferences: Awaited<ReturnType<typeof getPreferences>>;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const [lead, setLead] = useState<Lead>(closestLead(notifications.deadlineLeadMinutes));
  const [quietStart, setQuietStart] = useState(minuteToClock(preferences.quietStartMinute));
  const [quietEnd, setQuietEnd] = useState(minuteToClock(preferences.quietEndMinute));
  const sameQuiet = quietStart === quietEnd;
  const save = useMutation({
    mutationFn: async () => {
      const [savedNotifications, savedPreferences] = await Promise.all([
        updateNotificationPreferences({
          deadlineLeadMinutes: Number(lead),
          blockLeadMinutes: notifications.blockLeadMinutes,
          riskCooldownMinutes: notifications.riskCooldownMinutes,
          version: notifications.version,
        }),
        updatePreferences({
          minSessionMinutes: preferences.minSessionMinutes,
          maxSessionMinutes: preferences.maxSessionMinutes,
          maxDailyMinutes: preferences.maxDailyMinutes,
          notificationsEnabled: true,
          pushNotificationsEnabled: true,
          quietStartMinute: clockToMinute(quietStart),
          quietEndMinute: clockToMinute(quietEnd),
          version: preferences.version,
        }),
      ]);
      queryClient.setQueryData(["notification-preferences"], savedNotifications);
      queryClient.setQueryData(["preferences"], savedPreferences);
    },
  });
  return (
    <View style={styles.form}>
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
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Para dejar de recibir avisos, desactiva las notificaciones de NotesIA en los ajustes del
        teléfono.
      </Text>
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para guardar.</Text>
      )}
      {save.isSuccess && <Text accessibilityRole="alert">Avisos guardados.</Text>}
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
  flex: { flex: 1 },
});
