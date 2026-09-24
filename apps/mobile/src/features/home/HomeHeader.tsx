import { StyleSheet, View } from "react-native";
import { Avatar, Divider, Icon, Text, TouchableRipple, useTheme } from "react-native-paper";
import { layout } from "@/core/theme/layout";
import { iconTint } from "@/core/theme/theme";

export function HomeHeader({
  name,
  greeting,
  onOpenProfile,
}: {
  name: string;
  greeting: string;
  onOpenProfile: () => void;
}) {
  const theme = useTheme();
  const iconColor = iconTint[theme.dark ? "dark" : "light"];
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("es-EC") ?? "")
    .join("");

  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <TouchableRipple
          borderless
          onPress={onOpenProfile}
          accessibilityRole="button"
          accessibilityLabel="Abrir perfil"
          style={styles.profileButton}
        >
          <View style={styles.profileContent}>
            <Avatar.Text
              size={40}
              label={initials || "E"}
              color={iconColor}
              style={{ backgroundColor: theme.colors.primaryContainer }}
              labelStyle={styles.initials}
            />
            <Text variant="titleMedium" numberOfLines={1} style={styles.copy}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {greeting},{" "}
              </Text>
              <Text variant="titleMedium" style={styles.name}>
                {name}
              </Text>
            </Text>
          </View>
        </TouchableRipple>
        <View
          style={styles.notificationIcon}
          accessible
          accessibilityLabel="Notificaciones aún no disponibles"
        >
          <Icon source="bell-outline" size={layout.iconSize} color={iconColor} />
        </View>
      </View>
      <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  profileButton: {
    flex: 1,
    borderRadius: layout.profileRadius,
    minHeight: layout.minTouch,
    overflow: "hidden",
  },
  profileContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1 },
  initials: { fontWeight: "600" },
  name: { fontWeight: "600" },
  notificationIcon: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: layout.minTouch / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
