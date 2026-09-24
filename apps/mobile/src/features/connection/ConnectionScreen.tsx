import { useNetInfo } from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StatusBar, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Card,
  Divider,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { getReadiness } from "@/core/api/readiness";
import { layout, sharedStyles } from "@/core/theme/layout";

export function ConnectionScreen() {
  const theme = useTheme();
  const network = useNetInfo();
  const offline = network.isConnected === false;
  const readiness = useQuery({
    queryKey: ["readiness", network.isConnected],
    queryFn: () => getReadiness(),
  });

  let statusTitle: string;
  let statusDetail: string;
  let statusIcon:
    | "wifi-off"
    | "check-circle-outline"
    | "alert-circle-outline"
    | "cloud-sync-outline";

  if (offline && !readiness.isSuccess) {
    statusTitle = "Sin conexión";
    statusDetail = "Conecta el dispositivo a una red e inténtalo de nuevo.";
    statusIcon = "wifi-off";
  } else if (readiness.isPending || readiness.isFetching) {
    statusTitle = "Comprobando conexión";
    statusDetail = "Estamos consultando el servidor local.";
    statusIcon = "cloud-sync-outline";
  } else if (readiness.isError) {
    statusTitle = "No se pudo conectar";
    statusDetail = readiness.error.message;
    statusIcon = "alert-circle-outline";
  } else if (!readiness.data) {
    statusTitle = "Sin respuesta";
    statusDetail = "El servidor no devolvió datos. Puedes reintentar.";
    statusIcon = "alert-circle-outline";
  } else {
    statusTitle = "Conexión lista";
    statusDetail = "La aplicación pudo comunicarse con la API y la base de datos local.";
    statusIcon = "check-circle-outline";
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="default" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <Avatar.Icon
            size={64}
            icon="calendar-check-outline"
            color={theme.colors.onPrimaryContainer}
            style={{ backgroundColor: theme.colors.primaryContainer }}
            accessibilityLabel="Planificador estudiantil"
          />
          <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
            Planificador estudiantil
          </Text>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Organiza tus actividades con un plan que respete tu tiempo.
          </Text>
        </View>

        <Card mode="contained" style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium">Entorno local</Text>
            <Divider />
            <View style={styles.statusRow}>
              <Avatar.Icon
                size={48}
                icon={statusIcon}
                color={theme.colors.onPrimaryContainer}
                style={{ backgroundColor: theme.colors.primaryContainer }}
                accessibilityLabel={statusTitle}
              />
              <View style={styles.statusText}>
                <Text variant="titleMedium">{statusTitle}</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {statusDetail}
                </Text>
              </View>
            </View>
            {readiness.isFetching && <ActivityIndicator accessibilityLabel="Cargando" />}
            <Button
              mode="contained"
              icon="refresh"
              onPress={() => void readiness.refetch()}
              disabled={readiness.isFetching}
              accessibilityLabel="Reintentar conexión"
              contentStyle={sharedStyles.actionContent}
            >
              Reintentar
            </Button>
          </Card.Content>
        </Card>

        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Esta pantalla verifica el entorno de desarrollo. Las actividades y la agenda se añadirán
          en el siguiente flujo.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, padding: layout.pagePadding, gap: 32 },
  brand: { gap: 14, paddingTop: layout.pagePadding },
  title: { fontWeight: "600" },
  card: { borderRadius: layout.cardRadius },
  cardContent: { gap: layout.sectionGap, padding: layout.cardPadding },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  statusText: { flex: 1, gap: 4 },
});
