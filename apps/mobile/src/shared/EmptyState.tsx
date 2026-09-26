import { StyleSheet, View } from "react-native";
import { Icon, Surface, Text, useTheme } from "react-native-paper";
import { layout } from "@/core/theme/layout";
import { iconTint } from "@/core/theme/theme";
import { Button } from "@/shared/paper";

export function EmptyState({
  message,
  title,
  icon,
  actionLabel,
  onAction,
  variant,
}: {
  message: string;
  title?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "card" | "centered";
}) {
  const theme = useTheme();

  if (variant === "centered") {
    return (
      <View style={styles.centered}>
        {icon && <Icon source={icon} size={32} color={theme.colors.outline} />}
        <Text
          variant="bodyMedium"
          style={[styles.centeredMessage, { color: theme.colors.onSurfaceVariant }]}
        >
          {message}
        </Text>
      </View>
    );
  }

  const iconColor = iconTint[theme.dark ? "dark" : "light"];
  const surface = [{ backgroundColor: theme.colors.surface }];

  if (!title && !icon && !actionLabel) {
    return (
      <Surface elevation={0} style={[styles.container, surface]}>
        <Text variant="bodyLarge">{message}</Text>
      </Surface>
    );
  }

  return (
    <Surface elevation={0} style={[styles.container, styles.rich, surface]}>
      {icon && (
        <View style={styles.iconBox}>
          <Icon source={icon} size={40} color={iconColor} />
        </View>
      )}
      <View style={styles.copy}>
        {title && (
          <Text variant="titleMedium" style={styles.title}>
            {title}
          </Text>
        )}
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {message}
        </Text>
        {actionLabel && onAction && (
          <Button
            mode="outlined"
            compact
            icon="plus"
            onPress={onAction}
            style={[styles.action, { borderColor: theme.colors.outlineVariant }]}
            accessibilityLabel={actionLabel}
          >
            {actionLabel}
          </Button>
        )}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: "center", gap: 8, paddingVertical: 24 },
  centeredMessage: { textAlign: "center" },
  container: { padding: layout.cardPadding, borderRadius: layout.choiceRadius },
  rich: { flexDirection: "row", alignItems: "center", gap: 16 },
  iconBox: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 4 },
  title: { fontWeight: "700" },
  action: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderRadius: layout.smallRadius,
  },
});
