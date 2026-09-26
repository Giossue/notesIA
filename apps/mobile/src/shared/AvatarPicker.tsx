import { type AvatarId, avatarIds } from "@notesia/contracts";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Modal, Portal, Text, TouchableRipple, useTheme } from "react-native-paper";
import { layout } from "@/core/theme/layout";
import { Button } from "./paper";
import { UserAvatar } from "./UserAvatar";

const COLUMNS = 4;
const GAP = 12;
const PADDING = 20;

/**
 * Muestra solo el avatar elegido; la cuadrícula con todos se abre aparte y los
 * va dibujando al desplazarse, para no pintar decenas de SVG de golpe.
 */
export function AvatarPicker({
  value,
  onChange,
}: {
  value: AvatarId;
  onChange: (avatar: AvatarId) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.current}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cambiar avatar"
        onPress={() => setOpen(true)}
        style={[styles.currentRing, { borderColor: theme.colors.primary }]}
      >
        <UserAvatar avatar={value} size={72} />
      </Pressable>
      <View style={styles.currentText}>
        <Text variant="titleSmall">Tu avatar</Text>
        <Button mode="text" icon="pencil-outline" compact onPress={() => setOpen(true)}>
          Cambiar
        </Button>
      </View>
      <Portal>
        <Modal
          visible={open}
          onDismiss={() => setOpen(false)}
          contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
        >
          {open && (
            <AvatarGrid
              value={value}
              onChange={(avatar) => {
                onChange(avatar);
                setOpen(false);
              }}
            />
          )}
        </Modal>
      </Portal>
    </View>
  );
}

function AvatarGrid({ value, onChange }: { value: AvatarId; onChange(avatar: AvatarId): void }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  // Ancho del modal (márgenes de 20) menos su relleno, repartido en columnas.
  const size = Math.floor((width - 40 - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const row = size + GAP;
  return (
    <>
      <Text variant="titleMedium" style={styles.title}>
        Elige tu avatar
      </Text>
      <FlatList
        persistentScrollbar
        data={avatarIds}
        keyExtractor={(item) => item}
        numColumns={COLUMNS}
        style={{ maxHeight: height * 0.6 }}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        initialNumToRender={COLUMNS * 4}
        maxToRenderPerBatch={COLUMNS * 2}
        windowSize={3}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: row,
          offset: row * Math.floor(index / COLUMNS),
          index,
        })}
        renderItem={({ item }) => {
          const selected = item === value;
          return (
            <TouchableRipple
              borderless
              onPress={() => onChange(item)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Avatar ${item.replaceAll("-", " ")}`}
              style={[
                styles.option,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderColor: selected ? theme.colors.primary : "transparent",
                },
              ]}
            >
              <UserAvatar avatar={item} size={size - 10} />
            </TouchableRipple>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  current: { flexDirection: "row", alignItems: "center", gap: 16 },
  currentRing: { borderWidth: 3, borderRadius: 999, padding: 3 },
  currentText: { alignItems: "flex-start", gap: 2 },
  sheet: { marginHorizontal: 20, borderRadius: layout.cardRadius * 2, padding: PADDING },
  title: { fontWeight: "700", marginBottom: 16 },
  grid: { gap: GAP },
  gridRow: { gap: GAP },
  option: { borderWidth: 3, alignItems: "center", justifyContent: "center" },
});
