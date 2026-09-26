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

/** Documentos que hay que aceptar para usar la app; el de IA es aparte y opcional. */
export const requiredDocuments = (documents: PrivacyDocument[]) =>
  documents
    .filter((document) => document.type !== "ai")
    // "los Términos de uso y la Política de privacidad".
    .sort((a, b) => (a.type === "terms" ? -1 : b.type === "terms" ? 1 : 0));

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
            <ScrollView contentContainerStyle={styles.dialogContent}>
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
