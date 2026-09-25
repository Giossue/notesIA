import { StyleSheet, View } from "react-native";
import { Icon, Text, TouchableRipple, useTheme } from "react-native-paper";
import { layout } from "@/core/theme/layout";

export type TimelineEntryData = {
  key: string;
  /** Minutos desde la medianoche local. */
  startMinute: number;
  /** Fin en minutos locales; sin fin (entregas) ocupa el alto mínimo. */
  endMinute: number | null;
  range: string;
  label: string;
  color: string;
  title: string;
  meta: string;
  metaIcon: string;
  open: () => void;
};

const HOUR_HEIGHT = 72;
const LABEL_WIDTH = 48;
// Alto mínimo para que quepan etiqueta, título y horario.
const MIN_HEIGHT = 80;
const GAP = 4;

const top = (minute: number, firstHour: number) => ((minute - firstHour * 60) / 60) * HOUR_HEIGHT;

/**
 * Día como rejilla proporcional: cada hora mide lo mismo y cada tarjeta es tan
 * alta como dura, así la línea de la hora actual cae en su sitio exacto.
 */
export function DayTimeline({
  entries,
  nowMinute,
}: {
  entries: TimelineEntryData[];
  /** Minuto actual si el día mostrado es hoy. */
  nowMinute: number | null;
}) {
  const theme = useTheme();
  const extent = (entry: TimelineEntryData) => ({
    start: entry.startMinute,
    end: Math.max(
      entry.endMinute ?? entry.startMinute,
      entry.startMinute + (MIN_HEIGHT / HOUR_HEIGHT) * 60,
    ),
  });

  // Empieza a las 8:00, o antes si algo (o la hora actual) cae más temprano.
  const starts = entries.map((entry) => entry.startMinute);
  const firstHour = Math.min(
    8,
    ...starts.map((m) => Math.floor(m / 60)),
    ...(nowMinute === null ? [] : [Math.floor(nowMinute / 60)]),
  );
  // El día siempre llega hasta la medianoche: nada queda cortado al final.
  const lastHour = 24;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);

  // Tarjetas que se pisan comparten el ancho en columnas.
  const sorted = [...entries].sort((a, b) => a.startMinute - b.startMinute);
  const placed: Array<{ entry: TimelineEntryData; column: number; columns: number }> = [];
  let cluster: typeof placed = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];
  const closeCluster = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };
  for (const entry of sorted) {
    const { start, end } = extent(entry);
    if (start >= clusterEnd) closeCluster();
    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = end;
    clusterEnd = Math.max(clusterEnd, end);
    const item = { entry, column, columns: 1 };
    cluster.push(item);
    placed.push(item);
  }
  closeCluster();

  const nowVisible =
    nowMinute !== null && nowMinute >= firstHour * 60 && nowMinute <= lastHour * 60;

  return (
    // El margen superior deja ver la primera etiqueta, centrada sobre su línea.
    <View style={{ height: (lastHour - firstHour) * HOUR_HEIGHT + 12, marginTop: 8 }}>
      {hours.map((hour) => (
        <View key={hour} style={[styles.hourRow, { top: top(hour * 60, firstHour) }]}>
          <Text
            variant="labelMedium"
            style={[styles.hourLabel, { color: theme.colors.onSurfaceVariant }]}
          >
            {`${String(hour % 24).padStart(2, "0")}:00`}
          </Text>
          <View style={[styles.hourLine, { backgroundColor: theme.colors.outlineVariant }]} />
        </View>
      ))}

      <View style={styles.cards}>
        {placed.map(({ entry, column, columns }) => {
          const { start, end } = extent(entry);
          const height = ((end - start) / 60) * HOUR_HEIGHT - GAP;
          return (
            <TouchableRipple
              key={entry.key}
              borderless
              onPress={entry.open}
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${entry.title}`}
              style={[
                styles.card,
                {
                  top: top(start, firstHour),
                  height,
                  left: `${(column / columns) * 100}%`,
                  width: `${100 / columns}%`,
                  backgroundColor: theme.colors.surface,
                  // Separación entre tarjetas que comparten la franja.
                  marginRight: column < columns - 1 ? GAP : 0,
                },
              ]}
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
                  <Text variant="titleSmall" numberOfLines={1} style={styles.title}>
                    {entry.title}
                  </Text>
                  <Text
                    variant="bodySmall"
                    numberOfLines={1}
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {entry.range}
                  </Text>
                  {height >= 100 && (
                    <View style={styles.meta}>
                      <Icon
                        source={entry.metaIcon}
                        size={14}
                        color={theme.colors.onSurfaceVariant}
                      />
                      <Text
                        variant="bodySmall"
                        numberOfLines={1}
                        style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}
                      >
                        {entry.meta}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableRipple>
          );
        })}
      </View>

      {nowVisible && (
        <View
          pointerEvents="none"
          accessibilityLabel="Hora actual"
          style={[styles.now, { top: top(nowMinute, firstHour) - 5 }]}
        >
          <View style={[styles.nowDot, { backgroundColor: theme.colors.primary }]} />
          <View style={[styles.nowLine, { backgroundColor: theme.colors.primary }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    marginTop: -8,
    height: 16,
  },
  hourLabel: { width: LABEL_WIDTH },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth },
  cards: { position: "absolute", top: 0, bottom: 0, left: LABEL_WIDTH + 8, right: 0 },
  card: {
    position: "absolute",
    borderRadius: layout.cardRadius,
    overflow: "hidden",
  },
  cardInner: { flex: 1, flexDirection: "row" },
  bar: { width: 4 },
  content: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 1 },
  label: { fontWeight: "700", letterSpacing: 0.6 },
  title: { fontWeight: "700" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  metaText: { flex: 1 },
  now: {
    position: "absolute",
    left: LABEL_WIDTH - 8,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 2,
  },
  nowDot: { width: 10, height: 10, borderRadius: 5 },
  nowLine: { flex: 1, height: 2 },
});
