import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Divider, Text, useTheme } from "react-native-paper";
import { listNotifications, markNotificationRead } from "@/core/api/notifications";
import { layout } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { NotificationPreferencesForm } from "./NotificationPreferencesForm";

const labels = {
  plan_applied: "Plan aplicado",
  deadline_reminder: "Plazo próximo",
  block_reminder: "Bloque próximo",
  risk_alert: "Alerta de riesgo",
};

export function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const notifications = useInfiniteQuery({
    queryKey: ["notifications"],
    queryFn: ({ pageParam }) => listNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const markRead = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      markNotificationRead(id, version),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ScreenLayout header={{ title: "Notificaciones" }}>
      {offline && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los avisos guardados en esta sesión.
        </Text>
      )}
      {notifications.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando notificaciones" />
      )}
      {notifications.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{userMessage(notifications.error)}</Text>
          <Button onPress={() => void notifications.refetch()}>Reintentar</Button>
        </View>
      )}
      {!notifications.isPending && !notifications.isError && items.length === 0 && (
        <EmptyState icon="bell-check-outline" message="No tienes avisos pendientes." />
      )}
      {items.map((item) => (
        <Card key={item.id} mode={item.readAt ? "outlined" : "contained"}>
          <Card.Content style={styles.group}>
            <Text variant="titleMedium">{labels[item.type]}</Text>
            <Text>{new Date(item.createdAt).toLocaleString()}</Text>
            {item.activityId && (
              <Button
                onPress={() => {
                  if (item.activityId)
                    navigation.navigate("ActivityForm", {
                      id: item.activityId,
                    });
                }}
              >
                Abrir actividad
              </Button>
            )}
            {!item.activityId && item.planId && (
              <Button onPress={() => navigation.navigate("Planning")}>Abrir planificación</Button>
            )}
            {!item.readAt && (
              <Button
                disabled={offline || markRead.isPending}
                onPress={() => markRead.mutate({ id: item.id, version: item.version })}
              >
                Marcar como leída
              </Button>
            )}
          </Card.Content>
        </Card>
      ))}
      {notifications.hasNextPage && (
        <Button
          mode="outlined"
          loading={notifications.isFetchingNextPage}
          disabled={offline}
          onPress={() => void notifications.fetchNextPage()}
        >
          Cargar más
        </Button>
      )}
      <Divider />
      <NotificationPreferencesForm />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
