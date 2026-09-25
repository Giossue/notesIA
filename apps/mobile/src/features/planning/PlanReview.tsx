import type { planSchema } from "@notesia/contracts";
import { utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Dialog, Portal, Text, useTheme } from "react-native-paper";
import type { z } from "zod";
import { actOnPlan, editPlanBlock, removePlanBlock } from "@/core/api/plans";
import { layout } from "@/core/theme/layout";
import { ActivityTitle } from "@/features/activities/ActivityTitle";
import { EmptyState } from "@/shared/EmptyState";
import { PlanBlockEditor } from "./PlanBlockEditor";
import { diffPlanBlocks } from "./plan-diff";
import { planStatusLabels, riskLevelLabels, riskReasonLabel } from "./risk-labels";

type Plan = z.infer<typeof planSchema>;
const unscheduledLabels = {
  deadline_passed: "El plazo ya pasó",
  insufficient_capacity: "No hay capacidad suficiente",
  below_min_session: "Quedó por debajo de la sesión mínima",
};

export function PlanReview({
  initialPlan,
  timeZone,
  onChanged,
  baselineBlocks,
}: {
  initialPlan: Plan;
  timeZone: string;
  onChanged?(plan: Plan): void;
  baselineBlocks?: Plan["blocks"];
}) {
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [plan, setPlan] = useState(initialPlan);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<"apply" | "reject" | null>(null);
  const update = (updated: Plan) => {
    setPlan(updated);
    onChanged?.(updated);
    setEditingId(null);
  };
  const edit = useMutation({
    mutationFn: ({ blockId, locked }: { blockId: string; locked: boolean }) => {
      const block = plan.blocks.find((item) => item.id === blockId);
      if (!block) throw new Error("El bloque ya no está disponible.");
      return editPlanBlock(plan.id, block.id, {
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        isLocked: locked,
        version: plan.version,
      });
    },
    onSuccess: update,
  });
  const remove = useMutation({
    mutationFn: (blockId: string) => removePlanBlock(plan.id, blockId, plan.version),
    onSuccess: update,
  });
  const action = useMutation({
    mutationFn: (value: "apply" | "reject") => actOnPlan(plan.id, plan.version, value),
    onSuccess: (updated) => {
      update(updated);
      setConfirmation(null);
    },
  });
  const mutable = plan.status === "draft";
  const changes = baselineBlocks ? diffPlanBlocks(baselineBlocks, plan.blocks) : [];
  return (
    <View style={styles.group}>
      <Text variant="titleLarge">
        Plan {plan.from} a {plan.through}
      </Text>
      <Text>
        Estado: {planStatusLabels[plan.status]} · versión {plan.version}
      </Text>
      {baselineBlocks && (
        <Card mode="contained">
          <Card.Content style={styles.group}>
            <Text variant="titleMedium">Cambios frente al plan activo</Text>
            {changes.length === 0 && <Text>No cambian los bloques actuales.</Text>}
            {changes.map((change) => (
              <View
                key={`${change.kind}-${change.activityId}-${"previous" in change ? change.previous.startsAt : ""}-${"next" in change ? change.next.startsAt : ""}`}
              >
                <ActivityTitle id={change.activityId} />
                <Text>
                  {change.kind === "added"
                    ? `Nuevo: ${utcToLocalDateTime(change.next.startsAt, timeZone).replace("T", " ")}`
                    : change.kind === "removed"
                      ? `Se quita: ${utcToLocalDateTime(change.previous.startsAt, timeZone).replace("T", " ")}`
                      : `Se mueve: ${utcToLocalDateTime(change.previous.startsAt, timeZone).replace("T", " ")} → ${utcToLocalDateTime(change.next.startsAt, timeZone).replace("T", " ")}`}
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}
      {plan.blocks.length === 0 && <EmptyState message="El plan no contiene bloques de estudio." />}
      {plan.blocks.map((block) => (
        <Card key={block.id} mode="outlined">
          <Card.Content style={styles.group}>
            <ActivityTitle id={block.activityId} />
            <Text>
              {utcToLocalDateTime(block.startsAt, timeZone).replace("T", " ")} a{" "}
              {utcToLocalDateTime(block.endsAt, timeZone).replace("T", " ")}
            </Text>
            <Text>{block.isLocked ? "Bloque protegido" : "Bloque movible"}</Text>
            {editingId === block.id ? (
              <PlanBlockEditor
                plan={plan}
                block={block}
                timeZone={timeZone}
                onUpdated={update}
                onCancel={() => setEditingId(null)}
              />
            ) : mutable ? (
              <View style={styles.actions}>
                <Button
                  disabled={offline || edit.isPending}
                  onPress={() => edit.mutate({ blockId: block.id, locked: !block.isLocked })}
                >
                  {block.isLocked ? "Desbloquear" : "Bloquear"}
                </Button>
                <Button disabled={offline} onPress={() => setEditingId(block.id)}>
                  Editar hora
                </Button>
                <Button
                  disabled={offline || remove.isPending}
                  onPress={() => remove.mutate(block.id)}
                >
                  Quitar
                </Button>
              </View>
            ) : null}
          </Card.Content>
        </Card>
      ))}
      {plan.unscheduled.length > 0 && (
        <Card mode="contained">
          <Card.Content style={styles.group}>
            <Text variant="titleMedium">Trabajo no asignado</Text>
            {plan.unscheduled.map((item) => (
              <View key={item.activityId}>
                <ActivityTitle id={item.activityId} />
                <Text>
                  {item.minutes} min · {unscheduledLabels[item.reason]}
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}
      {plan.risk.length > 0 && (
        <Card mode="contained">
          <Card.Content style={styles.group}>
            <Text variant="titleMedium">Riesgo calculado</Text>
            {plan.risk.map((item) => (
              <View key={item.activityId}>
                <ActivityTitle id={item.activityId} />
                <Text>
                  Riesgo {riskLevelLabels[item.level]} · margen {item.marginMinutes} min
                </Text>
                {item.reasons.map((reason) => (
                  <Text key={reason} variant="bodySmall">
                    • {riskReasonLabel(reason)}
                  </Text>
                ))}
              </View>
            ))}
          </Card.Content>
        </Card>
      )}
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Conéctate para modificar el plan.
        </Text>
      )}
      {(edit.isError || remove.isError || action.isError) && (
        <Text accessibilityRole="alert">
          {edit.error?.message ?? remove.error?.message ?? action.error?.message}
        </Text>
      )}
      {mutable && (
        <View style={styles.actions}>
          <Button mode="outlined" disabled={offline} onPress={() => setConfirmation("reject")}>
            Rechazar propuesta
          </Button>
          <Button mode="contained" disabled={offline} onPress={() => setConfirmation("apply")}>
            Aplicar plan
          </Button>
        </View>
      )}
      <Portal>
        <Dialog visible={confirmation !== null} onDismiss={() => setConfirmation(null)}>
          <Dialog.Title>
            {confirmation === "apply" ? "Aplicar este plan" : "Rechazar esta propuesta"}
          </Dialog.Title>
          <Dialog.Content>
            <Text>
              {confirmation === "apply"
                ? "Los bloques pasarán a ser tu plan activo. La acción queda registrada."
                : "La propuesta se conservará en el historial como rechazada."}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmation(null)}>Cancelar</Button>
            <Button
              loading={action.isPending}
              onPress={() => confirmation && action.mutate(confirmation)}
            >
              Confirmar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.itemGap },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: layout.itemGap },
});
