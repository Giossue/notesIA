import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Animated, AppState, StyleSheet, View } from "react-native";
import { Icon, Text, TouchableRipple, useTheme } from "react-native-paper";
import { unreadNotificationCount } from "@/core/api/notifications";
import { getProfile } from "@/core/api/profile";
import type { RootStackParamList } from "@/navigation/types";
import { usePulse } from "@/shared/motion";
import { UserAvatar } from "@/shared/UserAvatar";

export function HomeHeader({ name, dateLabel }: { name: string; dateLabel: string }) {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // Punto en la campana si hay avisos sin leer; se revisa al volver a la app.
  const unreadCount = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: unreadNotificationCount,
    retry: false,
  });
  const { refetch } = unreadCount;
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
    });
    return () => subscription.remove();
  }, [refetch]);
  const unread = (unreadCount.data?.count ?? 0) > 0;
  // El punto de avisos sin leer late suave para llamar la atención.
  const pulse = usePulse(unread, 1.35, 700);
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });

  return (
    <View style={styles.row}>
      <TouchableRipple
        borderless
        onPress={() => navigation.navigate("Profile", { direction: "right" })}
        accessibilityRole="button"
        accessibilityLabel="Ir a tu perfil"
        style={styles.avatar}
      >
        <UserAvatar avatar={profile.data?.avatar} size={48} />
      </TouchableRipple>
      <View style={styles.copy}>
        <Text variant="headlineSmall" numberOfLines={1} style={styles.name}>
          Hola, {name}
        </Text>
        {!!dateLabel && (
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            {dateLabel}
          </Text>
        )}
      </View>
      <TouchableRipple
        borderless
        onPress={() => navigation.navigate("Notifications")}
        accessibilityRole="button"
        accessibilityLabel={unread ? "Notificaciones, hay avisos sin leer" : "Notificaciones"}
        style={[styles.bell, { backgroundColor: theme.colors.surfaceVariant }]}
      >
        <View>
          <Icon source="bell-outline" size={24} color={theme.colors.onSurface} />
          {unread && (
            <Animated.View
              style={[
                styles.dot,
                { backgroundColor: theme.colors.error, transform: [{ scale: pulse }] },
              ]}
            />
          )}
        </View>
      </TouchableRipple>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { borderRadius: 24 },
  copy: { flex: 1, gap: 2, minHeight: 48, justifyContent: "center" },
  name: { fontWeight: "700" },
  bell: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: 5 },
});
