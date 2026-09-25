import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";

/** Saludo de Inicio; herramientas y ajustes viven en Perfil. */
export function HomeHeader({ name, dateLabel }: { name: string; dateLabel: string }) {
  const theme = useTheme();

  return (
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
  );
}

const styles = StyleSheet.create({
  copy: { gap: 2, minHeight: 48, justifyContent: "center" },
  name: { fontWeight: "700" },
});
