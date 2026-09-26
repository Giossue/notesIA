import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Icon, Portal, Text, useTheme } from "react-native-paper";
import { getDeletionRequest } from "@/core/api/account";
import { listConsents, listPrivacyDocuments } from "@/core/api/privacy";
import { layout } from "@/core/theme/layout";
import { DeletionCard, ExportCard } from "@/features/account/AccountCards";
import { userMessage } from "@/shared/errors";
import { Button, Card, Dialog } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { legalNames, type PrivacyDocument } from "./LegalConsent";

/** Documentos, exportación y eliminación de la cuenta: todo en un lugar. */
export function PrivacyScreen() {
  const theme = useTheme();
  const documents = useQuery({
    queryKey: ["privacy-documents", "es"],
    queryFn: () => listPrivacyDocuments("es"),
    retry: false,
  });
  const consents = useQuery({ queryKey: ["consents"], queryFn: listConsents, retry: false });
  const deletion = useQuery({
    queryKey: ["account-deletion"],
    queryFn: getDeletionRequest,
    retry: false,
  });
  const [reading, setReading] = useState<PrivacyDocument | null>(null);
  const failed = [documents, consents].find((query) => query.isError);
  const accepted = (documentId: string) =>
    consents.data?.some((item) => item.documentId === documentId && item.decision === "accepted");
  const legal = documents.data ?? [];

  return (
    <ScreenLayout keyboardShouldPersistTaps="handled" header={{ title: "Privacidad y datos" }}>
      {(documents.isPending || consents.isPending) && (
        <ActivityIndicator accessibilityLabel="Cargando privacidad" />
      )}
      {failed && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{userMessage(failed.error)}</Text>
          <Button onPress={() => void failed.refetch()}>Reintentar</Button>
        </View>
      )}
      {legal.length > 0 && (
        <Card mode="contained">
          <Card.Content style={styles.group}>
            <Text variant="titleMedium" style={styles.bold}>
              Documentos
            </Text>
            {legal.map((document) => (
              <Pressable
                key={document.id}
                accessibilityRole="button"
                onPress={() => setReading(document)}
                style={styles.row}
              >
                <Icon source="book-open-outline" size={22} color={theme.colors.primary} />
                <View style={styles.flex}>
                  <Text variant="bodyLarge">{legalNames[document.type]}</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Versión {document.version}
                    {accepted(document.id) ? " · aceptada" : " · pendiente"}
                  </Text>
                </View>
                <Icon source="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
              </Pressable>
            ))}
          </Card.Content>
        </Card>
      )}
      <ExportCard />
      {!deletion.isPending && !deletion.isError && <DeletionCard status={deletion.data} />}
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
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  group: { gap: layout.itemGap },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  flex: { flex: 1, gap: 2 },
  bold: { fontWeight: "700" },
  dialogScroll: { maxHeight: 420, paddingHorizontal: 0 },
  dialogContent: { paddingHorizontal: 24, paddingVertical: 12 },
});
