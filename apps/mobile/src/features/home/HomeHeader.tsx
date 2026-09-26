import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { Icon, Text, TouchableRipple, useTheme } from "react-native-paper";
import { listNotifications } from "@/core/api/notifications";
import type { RootStackParamList } from "@/navigation/types";

export function HomeHeader({ name, dateLabel }: { name: string; dateLabel: string }) {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // Punto en la campana si hay avisos sin leer entre los más recientes.
  const recent = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => listNotifications(),
    retry: false,
  });
  const unread = recent.data?.items.some((item) => !item.readAt) ?? false;

  return (
    <View style={styles.row}>
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
          {unread && <View style={[styles.dot, { backgroundColor: theme.colors.error }]} />}
        </View>
      </TouchableRipple>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1, gap: 2, minHeight: 48, justifyContent: "center" },
  name: { fontWeight: "700" },
  bell: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: 5 },
});
