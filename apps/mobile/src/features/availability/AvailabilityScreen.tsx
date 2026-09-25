import type { availabilityRuleSchema } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  SegmentedButtons,
  Text,
  useTheme,
} from "react-native-paper";
import type { z } from "zod";
import { listAvailabilityRules, setAvailabilityRuleArchived } from "@/core/api/availability";
import { layout } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { AvailabilityCapacity } from "./AvailabilityCapacity";
import { AvailabilityExceptionForm } from "./AvailabilityExceptionForm";
import { AvailabilityRuleForm } from "./AvailabilityRuleForm";
import { minuteToClock } from "./time";

type Rule = z.infer<typeof availabilityRuleSchema>;
const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function AvailabilityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [editing, setEditing] = useState<Rule | undefined>();
  const [showArchived, setShowArchived] = useState(false);
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
  const shownRules =
    rules.data?.items.filter((rule) => Boolean(rule.archivedAt) === showArchived) ?? [];

  return (
    <ScreenLayout keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver">
        Volver
      </Button>
      <Text variant="headlineMedium">Disponibilidad</Text>
      <Text variant="bodyMedium">
        El planificador interpreta estos horarios en tu zona horaria.
      </Text>
      <SegmentedButtons
        value={showArchived ? "archived" : "active"}
        onValueChange={(value) => {
          setShowArchived(value === "archived");
          setEditing(undefined);
        }}
        buttons={[
          { value: "active", label: "Activos" },
          { value: "archived", label: "Archivados" },
        ]}
      />
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
          <Text accessibilityRole="alert">{rules.error.message}</Text>
          <Button onPress={() => void rules.refetch()}>Reintentar</Button>
        </View>
      )}
      {!rules.isPending && !rules.isError && shownRules.length === 0 && (
        <EmptyState
          message={
            showArchived ? "No hay horarios archivados." : "No has definido horarios semanales."
          }
        />
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
              {!rule.archivedAt && <Button onPress={() => setEditing(rule)}>Editar</Button>}
              <Button disabled={offline || archive.isPending} onPress={() => archive.mutate(rule)}>
                {rule.archivedAt ? "Restaurar" : "Archivar"}
              </Button>
            </View>
          </Card.Content>
        </Card>
      ))}
      {archive.isError && <Text accessibilityRole="alert">{archive.error.message}</Text>}
      {!showArchived && (
        <AvailabilityRuleForm
          key={editing?.version ?? "new"}
          rule={editing}
          onDone={() => setEditing(undefined)}
        />
      )}
      <Divider />
      <AvailabilityExceptionForm />
      <Divider />
      <AvailabilityCapacity />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.itemGap },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: layout.itemGap },
});
