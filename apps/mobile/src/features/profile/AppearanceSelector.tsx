import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { useAppearance } from "@/core/theme/AppearanceProvider";
import type { AppearancePreference } from "@/core/theme/appearance-storage";
import { layout } from "@/core/theme/layout";
import { Tabs } from "@/shared/Tabs";

export function AppearanceSelector() {
  const { preference, setPreference } = useAppearance();
  const theme = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (value: string) => {
    setSaving(true);
    setError(null);
    try {
      await setPreference(value as AppearancePreference);
    } catch {
      setError("No se pudo guardar la apariencia en este dispositivo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text variant="titleMedium">Apariencia</Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Elige el tema de este dispositivo.
      </Text>
      <Tabs
        value={preference}
        onValueChange={(value) => void change(value)}
        buttons={[
          { value: "light", label: "Claro", disabled: saving },
          { value: "dark", label: "Oscuro", disabled: saving },
          { value: "system", label: "Sistema", disabled: saving },
        ]}
      />
      {error && <Text accessibilityRole="alert">{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: layout.itemGap },
});
