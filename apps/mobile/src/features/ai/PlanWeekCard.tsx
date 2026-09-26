import { shiftLocalDate, todayInTimeZone } from "@notesia/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Icon, Text, useTheme } from "react-native-paper";
import { actOnPlan, previewPlan } from "@/core/api/plans";
import { getProfile } from "@/core/api/profile";
import { type ChatAction, updateChatAction } from "@/core/assistant/chat-store";
import { layout } from "@/core/theme/layout";
import { ActivityTitle } from "@/features/activities/ActivityTitle";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";

const unscheduledLabels = {
  deadline_passed: "el plazo ya pasó",
  insufficient_capacity: "no alcanza el tiempo",
  below_min_session: "queda muy poco tiempo para una sesión",
};

/** "lun 5 oct · 16:00–18:00" en la zona del estudiante. */
function slot(startsAt: string, endsAt: string, timeZone: string) {
  const day = new Date(startsAt).toLocaleDateString("es", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("es", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  return `${day} · ${time(startsAt)}–${time(endsAt)}`;
}

/**
 * Propuesta de plan del asistente: la arma el planificador de la app (no la IA)
 * y no cambia la agenda hasta que el estudiante la confirma.
 */
export function PlanWeekCard({ messageId, item }: { messageId: string; item: ChatAction }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const timeZone = profile.data?.timeZone;
  const pending = item.state === "pending" || item.state === "failed";
  const plan = useQuery({
    // El id de la tarjeta es el del plan: repetir la vista previa no crea otro.
    queryKey: ["assistant-plan", item.id],
    queryFn: () => {
      const from = todayInTimeZone(new Date().toISOString(), timeZone ?? "UTC");
      return previewPlan({ id: item.id, from, through: shiftLocalDate(from, 7) });
    },
    enabled: !!timeZone && (pending || item.state === "applying"),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const act = useMutation({
    mutationFn: (action: "apply" | "reject") => {
      if (!plan.data) throw new Error("La propuesta aún no está lista.");
      return actOnPlan(plan.data.id, plan.data.version, action);
    },
    onMutate: (action) => {
      if (action === "apply")
        updateChatAction(messageId, item.id, { state: "applying", error: undefined });
    },
    onSuccess: (_plan, action) => {
      updateChatAction(messageId, item.id, {
        state: action === "apply" ? "applied" : "dismissed",
      });
      void queryClient.invalidateQueries({ queryKey: ["active-plan"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error, action) => {
      if (action === "apply")
        updateChatAction(messageId, item.id, { state: "failed", error: userMessage(error) });
      // Si no se pudo descartar en el servidor, el borrador queda sin efecto igual.
      else updateChatAction(messageId, item.id, { state: "dismissed" });
    },
  });
  const blocks = plan.data?.blocks ?? [];
  const unscheduled = plan.data?.unscheduled ?? [];

  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.content}>
        <View style={styles.head}>
          <View style={[styles.icon, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon source="calendar-clock" size={18} color={theme.colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Planificar mi semana
            </Text>
            <Text variant="titleSmall" style={styles.bold}>
              {item.action.type === "plan_week" ? item.action.title : ""}
            </Text>
          </View>
        </View>
        {item.state === "applied" && (
          <Text style={[styles.bold, { color: theme.colors.primary }]}>
            Plan aplicado. Lo verás en tu agenda.
          </Text>
        )}
        {item.state === "dismissed" && (
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Descartado</Text>
        )}
        {(pending || item.state === "applying") && (
          <>
            {(profile.isPending || plan.isPending) && !plan.isError && !profile.isError && (
              <ActivityIndicator accessibilityLabel="Armando el plan" />
            )}
            {(plan.isError || profile.isError) && (
              <>
                <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                  {userMessage(plan.error ?? profile.error)}
                </Text>
                <Button onPress={() => void (profile.isError ? profile : plan).refetch()}>
                  Reintentar
                </Button>
              </>
            )}
            {plan.data && timeZone && (
              <>
                {blocks.length === 0 && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    No hay sesiones que proponer: revisa que tus tareas tengan tiempo estimado y que
                    tengas horario de estudio.
                  </Text>
                )}
                {blocks.map((block) => (
                  <View key={block.id} style={styles.row}>
                    <ActivityTitle id={block.activityId} />
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {slot(block.startsAt, block.endsAt, timeZone)}
                    </Text>
                  </View>
                ))}
                {unscheduled.map((row) => (
                  <View key={`${row.activityId}-${row.reason}`} style={styles.warning}>
                    <Icon source="alert-outline" size={16} color={theme.colors.error} />
                    <View style={styles.flex}>
                      <ActivityTitle id={row.activityId} />
                      <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                        Faltan {row.minutes} min: {unscheduledLabels[row.reason]}.
                      </Text>
                    </View>
                  </View>
                ))}
                {item.state === "failed" && (
                  <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                    {item.error}
                  </Text>
                )}
                <View style={styles.actions}>
                  <Button
                    mode="contained"
                    icon="check"
                    loading={item.state === "applying"}
                    disabled={item.state === "applying" || act.isPending || blocks.length === 0}
                    onPress={() => act.mutate("apply")}
                  >
                    {item.state === "failed" ? "Reintentar" : "Aplicar"}
                  </Button>
                  <Button
                    mode="text"
                    icon="close"
                    disabled={item.state === "applying" || act.isPending}
                    onPress={() => act.mutate("reject")}
                  >
                    Descartar
                  </Button>
                </View>
              </>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: "700" },
  card: { borderRadius: layout.cardRadius, alignSelf: "stretch" },
  content: { gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { gap: 2 },
  warning: { flexDirection: "row", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
});
