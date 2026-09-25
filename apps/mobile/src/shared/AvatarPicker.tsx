import { type AvatarId, avatarIds } from "@notesia/contracts";
import { FlatList, StyleSheet, View } from "react-native";
import { Text, TouchableRipple, useTheme } from "react-native-paper";
import { UserAvatar } from "./UserAvatar";

const SIZE = 64;
const GAP = 12;

/** Fila deslizable de avatares; el elegido lleva un anillo del color principal. */
export function AvatarPicker({
  value,
  onChange,
}: {
  value: AvatarId;
  onChange: (avatar: AvatarId) => void;
}) {
  const theme = useTheme();
  const selectedIndex = avatarIds.indexOf(value);

  return (
    <View style={styles.block}>
      <Text variant="titleSmall">Elige tu avatar</Text>
      <FlatList
        horizontal
        // Abre con el avatar elegido a la vista.
        initialScrollIndex={Math.max(0, selectedIndex - 1)}
        data={avatarIds}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        getItemLayout={(_, index) => ({
          length: SIZE + 8 + GAP,
          offset: (SIZE + 8 + GAP) * index,
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
                { borderColor: selected ? theme.colors.primary : "transparent" },
              ]}
            >
              <UserAvatar avatar={item} size={SIZE} />
            </TouchableRipple>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  row: { gap: GAP, paddingVertical: 4 },
  option: {
    width: SIZE + 8,
    height: SIZE + 8,
    borderRadius: (SIZE + 8) / 2,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
});
