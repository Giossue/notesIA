import { Fragment, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Checkbox, Portal, Text, useTheme } from "react-native-paper";
import type { listPrivacyDocuments } from "@/core/api/privacy";
import { Button, Dialog } from "@/shared/paper";

export type PrivacyDocument = Awaited<ReturnType<typeof listPrivacyDocuments>>[number];

export const legalNames = {
  terms: "Términos de uso",
  privacy: "Política de privacidad",
  ai: "Consentimiento de IA",
} as const;

const articles = { terms: "los ", privacy: "la ", ai: "el " } as const;

const order = { terms: 0, privacy: 1, ai: 2 } as const;

/** Documentos que hay que aceptar para usar la app, incluido el de IA. */
export const requiredDocuments = (documents: PrivacyDocument[]) =>
  // "los Términos de uso, la Política de privacidad y el Consentimiento de IA".
  [...documents].sort((a, b) => order[a.type] - order[b.type]);

/** Casilla "Acepto los … y la …" con cada nombre como enlace a su texto completo. */
export function LegalConsentCheckbox({
  documents,
  checked,
  onToggle,
  error,
}: {
  documents: PrivacyDocument[];
  checked: boolean;
  onToggle(): void;
  error?: string;
}) {
  const theme = useTheme();
  const [reading, setReading] = useState<PrivacyDocument | null>(null);
  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Checkbox.Android
          status={checked ? "checked" : "unchecked"}
          onPress={onToggle}
          accessibilityLabel="Acepto los documentos legales"
        />
        <Text style={styles.text} onPress={onToggle}>
          Acepto{" "}
          {documents.map((document, index) => (
            <Fragment key={document.id}>
              {index === 0 ? "" : index === documents.length - 1 ? " y " : ", "}
              {articles[document.type]}
              <Text
                accessibilityRole="link"
                onPress={() => setReading(document)}
                style={[styles.link, { color: theme.colors.primary }]}
              >
                {legalNames[document.type]}
              </Text>
            </Fragment>
          ))}
        </Text>
      </View>
      {error ? (
        <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
          {error}
        </Text>
      ) : null}
      <Portal>
        <Dialog visible={reading !== null} onDismiss={() => setReading(null)}>
          <Dialog.Title>{reading ? legalNames[reading.type] : ""}</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView persistentScrollbar contentContainerStyle={styles.dialogContent}>
              <Text selectable variant="bodyMedium">
                {reading?.content}
              </Text>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setReading(null)}>Cerrar</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 4 },
  row: { flexDirection: "row", alignItems: "center", marginLeft: -8 },
  text: { flex: 1 },
  link: { fontWeight: "600", textDecorationLine: "underline" },
  error: { paddingLeft: 4 },
  dialogScroll: { maxHeight: 420, paddingHorizontal: 0 },
  dialogContent: { paddingHorizontal: 24, paddingVertical: 12 },
});
