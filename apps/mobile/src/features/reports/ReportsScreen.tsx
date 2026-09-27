import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Chip, Icon, Text, useTheme } from "react-native-paper";
import { listReports } from "@/core/api/reports";
import { layout } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { reportStatusLabels, reportTypeLabels } from "./report-labels";

/** Mis reportes: estado y respuesta de soporte. */
export function ReportsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const reports = useQuery({ queryKey: ["reports"], queryFn: listReports, retry: false });
  const statusColor = {
    new: theme.colors.surfaceVariant,
    in_review: theme.colors.secondaryContainer,
    resolved: theme.colors.primaryContainer,
    closed: theme.colors.surfaceVariant,
  } as const;
  return (
    <ScreenLayout
      header={{ title: "Ayuda y reportes" }}
      fab={{ label: "Reportar un problema", onPress: () => navigation.navigate("ReportForm") }}
    >
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Cuéntanos si algo falla o si tienes una idea. Soporte te responderá aquí y te avisaremos.
      </Text>
      {reports.isPending && <ActivityIndicator accessibilityLabel="Cargando reportes" />}
      {reports.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{userMessage(reports.error)}</Text>
          <Button onPress={() => void reports.refetch()}>Reintentar</Button>
        </View>
      )}
      {reports.data?.items.length === 0 && (
        <EmptyState variant="centered" icon="lifebuoy" message="Todavía no enviaste reportes." />
      )}
      {reports.data?.items.map((report) => (
        <Card key={report.id} mode="contained">
          <Card.Content style={styles.group}>
            <View style={styles.row}>
              <Text variant="titleMedium" style={styles.flex}>
                {report.title}
              </Text>
              <Chip compact style={{ backgroundColor: statusColor[report.status] }}>
                {reportStatusLabels[report.status]}
              </Chip>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {reportTypeLabels[report.type]} · {new Date(report.createdAt).toLocaleDateString()}
            </Text>
            <Text numberOfLines={3}>{report.description}</Text>
            {report.reply && (
              <View style={[styles.reply, { backgroundColor: theme.colors.primaryContainer }]}>
                <View style={styles.row}>
                  <Icon source="lifebuoy" size={18} color={theme.colors.primary} />
                  <Text variant="labelLarge" style={{ color: theme.colors.primary }}>
                    Respuesta de soporte
                  </Text>
                </View>
                <Text>{report.reply}</Text>
              </View>
            )}
          </Card.Content>
        </Card>
      ))}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.itemGap },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  reply: { borderRadius: 12, padding: 12, gap: 6 },
});
