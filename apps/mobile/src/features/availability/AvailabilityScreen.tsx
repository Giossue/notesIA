import type { availabilityRuleSchema } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Divider, Text, useTheme } from "react-native-paper";
import type { z } from "zod";
import { listAvailabilityRules, setAvailabilityRuleArchived } from "@/core/api/availability";
import { getPreferences, updatePreferences } from "@/core/api/preferences";
import { layout } from "@/core/theme/layout";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";
import { AvailabilityExceptionForm } from "./AvailabilityExceptionForm";
import { AvailabilityRuleForm } from "./AvailabilityRuleForm";
import { minuteToClock } from "./time";

type Rule = z.infer<typeof availabilityRuleSchema>;
const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function AvailabilityScreen() {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [editing, setEditing] = useState<Rule | undefined>();
  const rules = useQuery({
    queryKey: ["availability-rules"],
    queryFn: listAvailabilityRules,
    retry: false,
  });
  const archive = useMutation({
    mutationFn: (rule: Rule) =>
      setAvailabilityRuleArchived(rule.id, rule.version, !rule.archivedAt),
    onSuccess: () => {
      setEditing(undefined);
      void queryClient.invalidateQueries({ queryKey: ["availability-rules"] });
    },
  });
  // Los horarios quitados quedan archivados y no se muestran.
  const shownRules = rules.data?.items.filter((rule) => !rule.archivedAt) ?? [];

  return (
    <ScreenLayout keyboardShouldPersistTaps="handled" header={{ title: "Mi horario de estudio" }}>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Indica cuándo puedes estudiar cada semana. El planificador solo propone sesiones en esos
        horarios.
      </Text>
      <DailyLimit />
      {offline && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los datos guardados en esta sesión.
        </Text>
      )}
      {rules.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando disponibilidad" />
      )}
      {rules.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{userMessage(rules.error)}</Text>
          <Button onPress={() => void rules.refetch()}>Reintentar</Button>
        </View>
      )}
      {!rules.isPending && !rules.isError && shownRules.length === 0 && (
        <EmptyState message="Todavía no agregas tus horarios de estudio." />
      )}
      {shownRules.map((rule) => (
        <Card key={rule.id} mode="contained">
          <Card.Content style={styles.group}>
            <Text variant="titleMedium">{weekdays[rule.weekday - 1]}</Text>
            <Text>
              {minuteToClock(rule.startMinute)} a {minuteToClock(rule.endMinute)}
              {rule.endMinute >= 1440 ? " del día siguiente" : ""}
            </Text>
            <View style={styles.actions}>
              <Button onPress={() => setEditing(rule)}>Editar</Button>
              <Button disabled={offline || archive.isPending} onPress={() => archive.mutate(rule)}>
                Quitar
              </Button>
            </View>
          </Card.Content>
        </Card>
      ))}
      <AvailabilityRuleForm
        key={editing?.version ?? "new"}
        rule={editing}
        onDone={() => setEditing(undefined)}
      />
      <Divider />
      <AvailabilityExceptionForm />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.itemGap },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: layout.itemGap },
});

const dailyChoices = [
  { value: "60", label: "1 h" },
  { value: "120", label: "2 h" },
  { value: "180", label: "3 h" },
  { value: "240", label: "4 h" },
  { value: "360", label: "6 h" },
] as const;

/** Tope de estudio por día que respeta el planificador; se guarda al elegirlo. */
function DailyLimit() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: getPreferences,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (minutes: number) => {
      const current = preferences.data;
      if (!current) throw new Error("Las preferencias aún no cargan.");
      return updatePreferences({
        minSessionMinutes: Math.min(current.minSessionMinutes, minutes),
        maxSessionMinutes: current.maxSessionMinutes,
        maxDailyMinutes: minutes,
        notificationsEnabled: true,
        pushNotificationsEnabled: true,
        quietStartMinute: current.quietStartMinute,
        quietEndMinute: current.quietEndMinute,
        version: current.version,
      });
    },
    onSuccess: (updated) => queryClient.setQueryData(["preferences"], updated),
  });
  if (!preferences.data) return null;
  const current = dailyChoices.reduce((best, choice) =>
    Math.abs(Number(choice.value) - preferences.data.maxDailyMinutes) <
    Math.abs(Number(best.value) - preferences.data.maxDailyMinutes)
      ? choice
      : best,
  ).value;
  return (
    <View style={styles.group}>
      <Text variant="titleSmall">Máximo de estudio al día</Text>
      <Tabs
        value={current}
        onValueChange={(value) => {
          if (!offline && !save.isPending) save.mutate(Number(value));
        }}
        buttons={[...dailyChoices]}
      />
      {save.isError && (
        <Text variant="bodySmall" style={{ color: theme.colors.error }}>
          {userMessage(save.error)}
        </Text>
      )}
    </View>
  );
}
