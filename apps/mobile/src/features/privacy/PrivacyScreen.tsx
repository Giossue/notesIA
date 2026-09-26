import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Icon, Portal, Switch, Text, useTheme } from "react-native-paper";
import { getDeletionRequest } from "@/core/api/account";
import {
  acceptConsent,
  listConsents,
  listPrivacyDocuments,
  revokeAiConsent,
} from "@/core/api/privacy";
import { layout } from "@/core/theme/layout";
import { DeletionCard, ExportCard } from "@/features/account/AccountCards";
import { userMessage } from "@/shared/errors";
import { Button, Card, Dialog } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { legalNames, type PrivacyDocument } from "./LegalConsent";

/** Documentos, uso de IA, exportación y eliminación de la cuenta: todo en un lugar. */
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
  const legal = documents.data?.filter((document) => document.type !== "ai") ?? [];
  const ai = documents.data?.find((document) => document.type === "ai");

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
      {ai && <AiConsentCard document={ai} enabled={!!accepted(ai.id)} onRead={setReading} />}
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

/** El asistente de IA es opcional: activarlo acepta el documento vigente; apagarlo lo revoca. */
function AiConsentCard({
  document,
  enabled,
  onRead,
}: {
  document: PrivacyDocument;
  enabled: boolean;
  onRead(document: PrivacyDocument): void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) await acceptConsent(document.id);
      else await revokeAiConsent();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["consents"] }),
  });
  return (
    <Card mode="contained">
      <Card.Content style={styles.group}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text variant="titleMedium" style={styles.bold}>
              Asistente con IA
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {enabled
                ? "Activado. Tus mensajes se procesan con un proveedor de IA."
                : "Desactivado. Todo lo demás de la app funciona igual."}
            </Text>
          </View>
          <Switch
            value={enabled}
            disabled={offline || toggle.isPending}
            onValueChange={(next) => toggle.mutate(next)}
            accessibilityLabel="Usar el asistente con IA"
          />
        </View>
        <Button mode="text" icon="book-open-outline" onPress={() => onRead(document)}>
          Leer cómo se usa la IA
        </Button>
      </Card.Content>
    </Card>
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
