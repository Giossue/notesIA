import { shiftLocalDate } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, HelperText, Portal, Text, useTheme } from "react-native-paper";
import { getTimeStatistics } from "@/core/api/time-entries";
import { layout } from "@/core/theme/layout";
import { type ExclusiveDateRange, exclusiveDateRangeSchema } from "@/shared/date-range";
import { userMessage } from "@/shared/errors";
import { DateField } from "@/shared/fields";
import { Button, Card, Dialog } from "@/shared/paper";

/** "21 sep – 27 sep" */
const rangeLabel = (from: string, through: string) => {
  const label = (day: string) =>
    new Date(`${day}T12:00:00Z`)
      .toLocaleDateString("es", { day: "numeric", month: "short", timeZone: "UTC" })
      .replaceAll(".", "");
  return `${label(from)} – ${label(through)}`;
};

export function TimeStatisticsPanel() {
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<ExclusiveDateRange | null>(null);
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [error, setError] = useState<string | null>(null);
  const statistics = useQuery({
    queryKey: ["time-statistics", range],
    queryFn: () => getTimeStatistics(range?.from ?? "", range?.through ?? ""),
    enabled: !!range,
    retry: false,
  });
  // "Hasta" incluye ese día; la API recibe el primer día fuera del rango.
  const consult = () => {
    if (!from || !through) return setError("Elige las dos fechas.");
    if (through < from) return setError("La fecha final no puede ser anterior a la inicial.");
    const parsed = exclusiveDateRangeSchema.safeParse({
      from,
      through: shiftLocalDate(through, 1),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Rango inválido.");
    setError(null);
    setRange(parsed.data);
    setOpen(false);
  };
  return (
    <View style={styles.group}>
      <View style={styles.row}>
        <Text variant="bodyMedium" style={[styles.flex, { color: theme.colors.onSurfaceVariant }]}>
          {range
            ? rangeLabel(range.from, shiftLocalDate(range.through, -1))
            : "Elige un periodo para ver cuánto estudiaste."}
        </Text>
        <Button
          mode="outlined"
          icon="calendar-search"
          disabled={offline}
          onPress={() => setOpen(true)}
        >
          Consultar
        </Button>
      </View>
      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)}>
          <Dialog.Title>Tiempo de estudio</Dialog.Title>
          <Dialog.Content style={styles.group}>
            <DateField label="Desde" value={from} onChange={setFrom} />
            <DateField label="Hasta" value={through} onChange={setThrough} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Hasta 31 días.
            </Text>
            {error && <HelperText type="error">{error}</HelperText>}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>Cancelar</Button>
            <Button mode="contained" icon="magnify" onPress={consult}>
              Consultar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
              <Text>No hay tareas con tiempo registrado en este periodo.</Text>
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

const styles = StyleSheet.create({
  group: { gap: layout.itemGap },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
});
