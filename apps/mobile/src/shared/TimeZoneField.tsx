import { useMemo, useState } from "react";
import { FlatList, StyleSheet } from "react-native";
import { List, Portal } from "react-native-paper";
import { PressableField } from "./fields";
import { Button, Dialog, TextInput } from "./paper";
import { deviceTimeZone, timeZoneLabel, timeZoneOptions } from "./time-zones";

/** Zona horaria elegida de la lista completa, con buscador y la del teléfono primero. */
export function TimeZoneField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const device = deviceTimeZone();
  const zones = useMemo(() => timeZoneOptions(value, device), [value, device]);
  const normalized = query.trim().toLocaleLowerCase("es").replaceAll(" ", "_");
  const filtered = normalized
    ? zones.filter((zone) => zone.toLocaleLowerCase("es").includes(normalized))
    : [device, ...zones.filter((zone) => zone !== device)];

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <PressableField
        label="Zona horaria"
        value={timeZoneLabel(value)}
        icon="menu-down"
        onPress={() => !disabled && setOpen(true)}
      />
      <Portal>
        <Dialog visible={open} onDismiss={close} style={styles.dialog}>
          <Dialog.Title>Zona horaria</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Buscar ciudad o región"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              left={<TextInput.Icon icon="magnify" />}
            />
          </Dialog.Content>
          <Dialog.ScrollArea style={styles.scroll}>
            <FlatList
              data={filtered}
              keyExtractor={(zone) => zone}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              renderItem={({ item }) => (
                <List.Item
                  title={timeZoneLabel(item)}
                  description={item === device ? "La de tu teléfono" : undefined}
                  right={(props) => (item === value ? <List.Icon {...props} icon="check" /> : null)}
                  onPress={() => {
                    onChange(item);
                    close();
                  }}
                  accessibilityState={{ selected: item === value }}
                />
              )}
            />
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={close}>Cancelar</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  dialog: { maxHeight: "85%" },
  scroll: { height: 360, paddingHorizontal: 0 },
});
