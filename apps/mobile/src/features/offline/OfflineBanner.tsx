import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { Icon, Text, TouchableRipple, useTheme } from "react-native-paper";
import { listQueuedMutations } from "@/core/offline/outbox";
import { layout } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";

/**
 * Aviso que solo aparece si hay cambios hechos sin conexión que aún no se
 * enviaron o que tuvieron un problema; lleva a revisarlos.
 */
export function OfflineBanner() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queue = useQuery({
    queryKey: ["offline-outbox"],
    queryFn: listQueuedMutations,
    networkMode: "always",
    refetchInterval: 30_000,
  });
  const items = queue.data ?? [];
  if (items.length === 0) return null;
  const problems = items.filter((item) => item.status !== "pending").length;
  const tint = problems > 0 ? theme.colors.error : theme.colors.primary;
  return (
    <TouchableRipple
      borderless
      onPress={() => navigation.navigate("OfflineChanges")}
      accessibilityRole="button"
      style={[
        styles.banner,
        {
          backgroundColor:
            problems > 0 ? theme.colors.errorContainer : theme.colors.primaryContainer,
        },
      ]}
    >
      <View style={styles.row}>
        <Icon source={problems > 0 ? "alert" : "cloud-upload-outline"} size={22} color={tint} />
        <Text style={[styles.text, { color: tint }]}>
          {problems > 0
            ? `${problems} ${problems === 1 ? "cambio necesita" : "cambios necesitan"} tu revisión`
            : `${items.length} ${items.length === 1 ? "cambio se enviará" : "cambios se enviarán"} al volver la conexión`}
        </Text>
        <Icon source="chevron-right" size={20} color={tint} />
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: layout.cardRadius },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  text: { flex: 1, fontWeight: "600" },
});
