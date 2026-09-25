import { zodResolver } from "@hookform/resolvers/zod";
import { useNetInfo } from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, HelperText, Text, useTheme } from "react-native-paper";
import { getTimeStatistics } from "@/core/api/time-entries";
import { layout } from "@/core/theme/layout";
import { type ExclusiveDateRange, exclusiveDateRangeSchema } from "@/shared/date-range";
import { userMessage } from "@/shared/errors";
import { DateField } from "@/shared/fields";
import { Button, Card } from "@/shared/paper";

export function TimeStatisticsPanel() {
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
  const statistics = useQuery({
    queryKey: ["time-statistics", range],
    queryFn: () => getTimeStatistics(range?.from ?? "", range?.through ?? ""),
    enabled: !!range,
    retry: false,
  });
  return (
    <View style={styles.group}>
      <Text variant="titleMedium">Estadísticas</Text>
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
      <Text variant="bodySmall">“Hasta” es el primer día fuera del cálculo.</Text>
      <Button mode="outlined" disabled={offline} onPress={() => void handleSubmit(setRange)()}>
        Consultar estadísticas
      </Button>
      {offline && (
        <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para consultar.</Text>
      )}
      {statistics.isFetching && <ActivityIndicator accessibilityLabel="Calculando estadísticas" />}
      {statistics.isError && <Text accessibilityRole="alert">{userMessage(statistics.error)}</Text>}
      {statistics.data && (
        <Card mode="contained">
          <Card.Content style={styles.group}>
            <Text variant="titleLarge">
              {Math.round(statistics.data.totalSeconds / 60)} minutos registrados
            </Text>
            {statistics.data.weeks.map((week) => (
              <View key={week.weekStart}>
                <Text variant="titleSmall">Semana del {week.weekStart}</Text>
                <Text>
                  {Math.round(week.seconds / 60)} min · {week.completedActivities} completadas ·
                  puntualidad {week.onTimePercent ?? "sin datos"}
                  {week.onTimePercent === null ? "" : "%"}
                </Text>
                <Text variant="bodySmall">
                  {week.dueActivities} con plazo · {week.overdueActivities} fuera de plazo
                </Text>
              </View>
            ))}
            <Text variant="titleMedium">Estimado frente a real</Text>
            {statistics.data.activities.length === 0 && (
              <Text>No hay actividades con tiempo registrado en este periodo.</Text>
            )}
            {statistics.data.activities.map((activity) => (
              <View key={activity.activityId}>
                <Text variant="titleSmall">{activity.title}</Text>
                <Text>
                  Estimado: {activity.estimatedMinutes ?? "sin estimación"}
                  {activity.estimatedMinutes === null ? "" : " min"} · Real en el periodo:{" "}
                  {Math.round(activity.actualSeconds / 60)} min
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
