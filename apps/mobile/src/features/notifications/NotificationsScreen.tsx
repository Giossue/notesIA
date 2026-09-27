import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import {
  type AppNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/core/api/notifications";
import { layout } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { notificationTarget } from "./notification-target";

const dateFormat = new Intl.DateTimeFormat("es", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

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
  const hasUnread = items.some((item) => !item.readAt);
  const markAll = useMutation({
    // Solo hasta el más reciente que se ve: uno que llegue ahora sigue sin leer.
    mutationFn: () => markAllNotificationsRead(items[0]?.createdAt ?? new Date().toISOString()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const open = (item: AppNotification) => {
    const target = notificationTarget(item);
    if (!target) return;
    if (!item.readAt && !offline) markRead.mutate({ id: item.id, version: item.version });
    if (target.screen === "ActivityForm") navigation.navigate("ActivityForm", { id: target.id });
    else navigation.navigate(target.screen);
  };
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
        <EmptyState
          variant="centered"
          icon="bell-check-outline"
          message="No tienes avisos pendientes."
        />
      )}
      {hasUnread && (
        <Button
          icon="check-all"
          disabled={offline || markAll.isPending}
          loading={markAll.isPending}
          onPress={() => markAll.mutate()}
        >
          Marcar todas como leídas
        </Button>
      )}
      {items.map((item) => {
        const target = notificationTarget(item);
        return (
          <Card key={item.id} mode={item.readAt ? "outlined" : "contained"}>
            <Card.Content style={styles.group}>
              <Text variant="titleMedium">{item.title}</Text>
              {!!item.body && <Text variant="bodyMedium">{item.body}</Text>}
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {dateFormat.format(new Date(item.createdAt))}
              </Text>
              {target && <Button onPress={() => open(item)}>{target.label}</Button>}
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
        );
      })}
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
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
