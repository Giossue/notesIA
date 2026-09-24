import { StyleSheet, View } from "react-native";
import { Button, Icon, Surface, Text, useTheme } from "react-native-paper";
import { layout } from "@/core/theme/layout";
import { iconTint } from "@/core/theme/theme";

export function EmptyState({
  message,
  title,
  icon,
  actionLabel,
  onAction,
}: {
  message: string;
  title?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  const iconColor = iconTint[theme.dark ? "dark" : "light"];

  if (!title && !icon && !actionLabel) {
    return (
      <Surface
        elevation={0}
        style={[styles.container, { backgroundColor: theme.colors.surfaceVariant }]}
      >
        <Text variant="bodyLarge">{message}</Text>
      </Surface>
    );
  }

  return (
    <Surface
      elevation={0}
      style={[styles.container, styles.rich, { backgroundColor: theme.colors.surfaceVariant }]}
    >
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
  action: { alignSelf: "flex-start", marginTop: 8, borderRadius: layout.navRadius },
});
