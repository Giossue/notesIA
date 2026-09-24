import type { Subject } from "@notesia/contracts";
import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple, useTheme } from "react-native-paper";
import { layout } from "@/core/theme/layout";

const options: { value: Subject["colorToken"]; label: string }[] = [
  { value: "primary", label: "Principal" },
  { value: "secondary", label: "Secundario" },
  { value: "tertiary", label: "Acento" },
];

export function SubjectColorPicker({
  value,
  onChange,
}: {
  value: Subject["colorToken"];
  onChange: (value: Subject["colorToken"]) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableRipple
            borderless
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`Color ${option.label}`}
            style={[
              styles.option,
              {
                backgroundColor: selected ? theme.colors.secondaryContainer : theme.colors.surface,
                borderColor: selected ? theme.colors.secondary : theme.colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.optionContent}>
              <View
                testID={`subject-color-${option.value}-swatch`}
                style={[styles.swatch, { backgroundColor: theme.colors[option.value] }]}
              />
              <Text variant="labelMedium" numberOfLines={1}>
                {option.label}
              </Text>
            </View>
          </TouchableRipple>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: layout.itemGap },
  option: { flex: 1, minHeight: 72, borderWidth: 1, borderRadius: layout.choiceRadius },
  optionContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: 8 },
  swatch: { width: 22, height: 22, borderRadius: 11 },
});
