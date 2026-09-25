import { zodResolver } from "@hookform/resolvers/zod";
import { useNetInfo } from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { getRiskAssessment } from "@/core/api/plans";
import { layout } from "@/core/theme/layout";
import { ActivityTitle } from "@/features/activities/ActivityTitle";
import { type ExclusiveDateRange, exclusiveDateRangeSchema } from "@/shared/date-range";
import { EmptyState } from "@/shared/EmptyState";
import { riskLevelLabels, riskReasonLabel } from "./risk-labels";

export function RiskPanel() {
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [range, setRange] = useState<ExclusiveDateRange | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ExclusiveDateRange>({
    resolver: zodResolver(exclusiveDateRangeSchema),
    defaultValues: { from: "", through: "" },
  });
  const risk = useQuery({
    queryKey: ["risk-assessments", range],
    queryFn: () => getRiskAssessment(range?.from ?? "", range?.through ?? ""),
    enabled: !!range,
    retry: false,
  });
  return (
    <View style={styles.group}>
      <Text variant="titleMedium">Evaluar riesgo sin crear un plan</Text>
      {(["from", "through"] as const).map((name) => (
        <View key={name}>
          <Controller
            control={control}
            name={name}
            render={({ field }) => (
              <TextInput
                mode="outlined"
                label={name === "from" ? "Desde" : "Hasta"}
                placeholder="2026-10-01"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={!!errors[name]}
              />
            )}
          />
          <HelperText type="error" visible={!!errors[name]}>
            {errors[name]?.message}
          </HelperText>
        </View>
      ))}
      <Text variant="bodySmall">“Hasta” es el primer día fuera del cálculo.</Text>
      <Button mode="outlined" disabled={offline} onPress={() => void handleSubmit(setRange)()}>
        Calcular riesgo
      </Button>
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para calcular.</Text>
      )}
      {risk.isFetching && <ActivityIndicator accessibilityLabel="Calculando riesgo" />}
      {risk.isError && <Text accessibilityRole="alert">{risk.error.message}</Text>}
      {risk.data && risk.data.risk.length === 0 && (
        <EmptyState message="No se detectó riesgo para ese periodo." />
      )}
      {risk.data?.risk.map((item) => (
        <Card key={item.activityId} mode="outlined">
          <Card.Content style={styles.group}>
            <ActivityTitle id={item.activityId} />
            <Text variant="titleSmall">Riesgo {riskLevelLabels[item.level]}</Text>
            <Text>
              Restante {item.remainingMinutes} min · capacidad {item.capacityMinutes} min · margen{" "}
              {item.marginMinutes} min
            </Text>
            {item.reasons.map((reason) => (
              <Text key={reason}>• {riskReasonLabel(reason)}</Text>
            ))}
          </Card.Content>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
