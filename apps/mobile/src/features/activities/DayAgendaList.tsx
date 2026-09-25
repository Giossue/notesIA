import { StyleSheet, View } from "react-native";
import { Icon, Text, TouchableRipple, useTheme } from "react-native-paper";
import { layout } from "@/core/theme/layout";

export type AgendaEntry = {
  key: string;
  /** Minutos desde la medianoche local. */
  startMinute: number;
  /** Fin en minutos locales; las entregas no tienen. */
  endMinute: number | null;
  label: string;
  color: string;
  title: string;
  meta: string;
  metaIcon: string;
  open: () => void;
};

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/**
 * El día como lista ordenada por hora: cada elemento con su hora a la izquierda
 * (inicio y, si tiene, fin). Si el día es hoy, lo que ya terminó se atenúa.
 */
export function DayAgendaList({
  entries,
  nowMinute,
}: {
  entries: AgendaEntry[];
  /** Minuto actual si el día mostrado es hoy. */
  nowMinute: number | null;
}) {
  const theme = useTheme();
  const sorted = [...entries].sort((a, b) => a.startMinute - b.startMinute);
  return (
    <View style={styles.list}>
      {sorted.map((entry) => {
        const past = nowMinute !== null && (entry.endMinute ?? entry.startMinute) <= nowMinute;
        return (
          <View key={entry.key} style={[styles.row, past && styles.past]}>
            <View style={styles.timeColumn}>
              <Text variant="labelLarge" style={styles.bold}>
                {clock(entry.startMinute)}
              </Text>
              {entry.endMinute !== null && (
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {clock(entry.endMinute)}
                </Text>
              )}
            </View>
            <TouchableRipple
              borderless
              onPress={entry.open}
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${entry.title}`}
              style={[styles.card, { backgroundColor: theme.colors.surface }]}
            >
              <View style={styles.cardInner}>
                <View style={[styles.bar, { backgroundColor: entry.color }]} />
                <View style={styles.content}>
                  <Text
                    variant="labelSmall"
                    numberOfLines={1}
                    style={[styles.label, { color: entry.color }]}
                  >
                    {entry.label.toLocaleUpperCase("es")}
                  </Text>
                  <Text variant="titleMedium" numberOfLines={2} style={styles.bold}>
                    {entry.title}
                  </Text>
                  <View style={styles.meta}>
                    <Icon source={entry.metaIcon} size={14} color={theme.colors.onSurfaceVariant} />
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}
                    >
                      {entry.meta}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableRipple>
          </View>
        );
      })}
    </View>
  );
}

const TIME_WIDTH = 52;

const styles = StyleSheet.create({
  list: { gap: 12 },
  row: { flexDirection: "row", gap: 8 },
  // Lo que ya terminó hoy se atenúa un poco.
  past: { opacity: 0.55 },
  timeColumn: { width: TIME_WIDTH, paddingTop: 10, gap: 2 },
  time: { width: TIME_WIDTH },
  bold: { fontWeight: "700" },
  card: { flex: 1, borderRadius: layout.cardRadius, overflow: "hidden" },
  cardInner: { flexDirection: "row" },
  bar: { width: 4 },
  content: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  label: { fontWeight: "700", letterSpacing: 0.6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  metaText: { flex: 1 },
});
