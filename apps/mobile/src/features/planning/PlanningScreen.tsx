import { zodResolver } from "@hookform/resolvers/zod";
import type { planSchema } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Divider, HelperText, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import type { z } from "zod";
import { getActivePlan, listPlanHistory, previewPlan } from "@/core/api/plans";
import { getProfile } from "@/core/api/profile";
import { layout } from "@/core/theme/layout";
import { type ExclusiveDateRange, exclusiveDateRangeSchema } from "@/shared/date-range";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { DateField } from "@/shared/fields";
import { Button, Card } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { PlanReview } from "./PlanReview";
import { RiskPanel } from "./RiskPanel";
import { planStatusLabels } from "./risk-labels";

type Plan = z.infer<typeof planSchema>;

export function PlanningScreen() {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [draft, setDraft] = useState<Plan | null>(null);
  const requestIdentity = useRef({ fingerprint: "", id: uuidv4() });
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: false,
  });
  const active = useQuery({
    queryKey: ["active-plan"],
    queryFn: getActivePlan,
    retry: false,
  });
  const history = useInfiniteQuery({
    queryKey: ["plan-history"],
    queryFn: ({ pageParam }) => listPlanHistory(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ExclusiveDateRange>({
    resolver: zodResolver(exclusiveDateRangeSchema),
    defaultValues: { from: "", through: "" },
  });
  const preview = useMutation({
    mutationFn: (range: ExclusiveDateRange) => {
      const fingerprint = JSON.stringify(range);
      if (requestIdentity.current.fingerprint !== fingerprint)
        requestIdentity.current = { fingerprint, id: uuidv4() };
      return previewPlan({ id: requestIdentity.current.id, ...range });
    },
    onSuccess: setDraft,
  });
  const refreshPlans = (plan: Plan) => {
    setDraft(plan.status === "draft" ? plan : null);
    void queryClient.invalidateQueries({ queryKey: ["active-plan"] });
    void queryClient.invalidateQueries({ queryKey: ["plan-history"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const historyItems = history.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ScreenLayout keyboardShouldPersistTaps="handled" header={{ title: "Planificación" }}>
      <Text variant="bodyMedium">
        La propuesta no modifica tu agenda hasta que pulses “Aplicar plan”.
      </Text>
      <Card mode="contained">
        <Card.Content style={styles.group}>
          <Text variant="titleMedium">Nueva vista previa</Text>
          {(["from", "through"] as const).map((name) => (
            <View key={name}>
              <Controller
                control={control}
                name={name}
                render={({ field }) => (
                  <DateField
                    label={name === "from" ? "Desde" : "Hasta"}
                    value={field.value}
                    onChange={field.onChange}
                    error={!!errors[name]}
                  />
                )}
              />
              {errors[name] && <HelperText type="error">{errors[name]?.message}</HelperText>}
            </View>
          ))}
          <Text variant="bodySmall">“Hasta” es el primer día que queda fuera del plan.</Text>
          {offline && (
            <Text style={{ color: theme.colors.error }}>
              Sin conexión. Conéctate para generar el plan.
            </Text>
          )}
          <Button
            mode="contained"
            loading={preview.isPending}
            disabled={offline || preview.isPending}
            onPress={() => void handleSubmit((values) => preview.mutate(values))()}
          >
            Generar propuesta
          </Button>
        </Card.Content>
      </Card>
      {draft && profile.data && (
        <PlanReview
          key={`${draft.id}-${draft.version}`}
          initialPlan={draft}
          timeZone={profile.data.timeZone}
          onChanged={refreshPlans}
          baselineBlocks={active.data?.blocks ?? []}
        />
      )}
      <Divider />
      <Text variant="titleMedium">Plan activo</Text>
      {active.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando plan activo" />
      )}
      {active.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{userMessage(active.error)}</Text>
          <Button onPress={() => void active.refetch()}>Reintentar</Button>
        </View>
      )}
      {active.data === null && !active.isPending && (
        <EmptyState message="Todavía no hay un plan activo." />
      )}
      {active.data && profile.data && (
        <View style={styles.group}>
          {active.data.isStale && (
            <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
              El plan quedó desactualizado porque cambiaron sus datos de origen.
            </Text>
          )}
          <PlanReview
            key={`${active.data.id}-${active.data.version}`}
            initialPlan={active.data}
            timeZone={profile.data.timeZone}
          />
        </View>
      )}
      <Divider />
      <RiskPanel />
      <Divider />
      <Text variant="titleMedium">Historial de planes</Text>
      {history.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando historial de planes" />
      )}
      {history.isError && <Text accessibilityRole="alert">{userMessage(history.error)}</Text>}
      {!history.isPending && !history.isError && historyItems.length === 0 && (
        <EmptyState message="Aún no hay planes anteriores." />
      )}
      {historyItems.map((item) => (
        <Card key={item.id} mode="outlined">
          <Card.Content style={styles.group}>
            <Text variant="titleSmall">
              {item.from} a {item.through}
            </Text>
            <Text>
              Estado: {planStatusLabels[item.status]} · versión {item.version}
            </Text>
            <Text>{new Date(item.createdAt).toLocaleString()}</Text>
          </Card.Content>
        </Card>
      ))}
      {history.hasNextPage && (
        <Button
          mode="outlined"
          disabled={offline}
          loading={history.isFetchingNextPage}
          onPress={() => void history.fetchNextPage()}
        >
          Cargar más
        </Button>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
