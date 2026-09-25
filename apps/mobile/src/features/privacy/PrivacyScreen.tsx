import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Portal, Text, useTheme } from "react-native-paper";
import {
  acceptConsent,
  listConsents,
  listPrivacyDocuments,
  revokeAiConsent,
} from "@/core/api/privacy";
import { getProfile } from "@/core/api/profile";
import { layout } from "@/core/theme/layout";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { Button, Card, Dialog } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";

const typeLabels = {
  terms: "Términos de uso",
  privacy: "Política de privacidad",
  ai: "Uso opcional de IA",
};

export function PrivacyScreen() {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: false,
  });
  const documents = useQuery({
    queryKey: ["privacy-documents", profile.data?.language],
    queryFn: () => listPrivacyDocuments(profile.data?.language ?? "es"),
    enabled: !!profile.data,
    retry: false,
  });
  const consents = useQuery({
    queryKey: ["consents"],
    queryFn: listConsents,
    retry: false,
  });
  const accept = useMutation({
    mutationFn: acceptConsent,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["consents"] }),
  });
  const revoke = useMutation({
    mutationFn: revokeAiConsent,
    onSuccess: () => {
      setConfirmRevoke(false);
      void queryClient.invalidateQueries({ queryKey: ["consents"] });
    },
  });
  const currentConsent = (type: "terms" | "privacy" | "ai", documentId: string) =>
    consents.data?.find((item) => item.type === type && item.documentId === documentId);

  return (
    <ScreenLayout header={{ title: "Privacidad y consentimientos" }}>
      <Text variant="bodyMedium">
        La IA es opcional. Revocarla conserva las funciones manuales.
      </Text>
      {offline && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los documentos guardados en esta sesión.
        </Text>
      )}
      {(profile.isPending || documents.isPending || consents.isPending) && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando privacidad" />
      )}
      {[profile, documents, consents].map((query, index) =>
        query.isError ? (
          <View key={String(index)} style={styles.group}>
            <Text accessibilityRole="alert">{userMessage(query.error)}</Text>
            <Button onPress={() => void query.refetch()}>Reintentar</Button>
          </View>
        ) : null,
      )}
      {documents.data?.length === 0 && (
        <EmptyState message="Todavía no hay documentos publicados para este idioma." />
      )}
      {documents.data?.map((document) => {
        const consent = currentConsent(document.type, document.id);
        const accepted = consent?.decision === "accepted";
        return (
          <Card key={document.id} mode="contained">
            <Card.Content style={styles.group}>
              <Text variant="titleMedium">
                {typeLabels[document.type]} · versión {document.version}
              </Text>
              <Text selectable>{document.content}</Text>
              <Text variant="bodySmall">
                Publicado: {new Date(document.publishedAt).toLocaleString()}
              </Text>
              <Button
                mode={accepted ? "outlined" : "contained"}
                disabled={offline || accepted || accept.isPending}
                onPress={() => accept.mutate(document.id)}
              >
                {accepted ? "Aceptado" : "Aceptar esta versión"}
              </Button>
              {document.type === "ai" && accepted && (
                <Button disabled={offline} onPress={() => setConfirmRevoke(true)}>
                  Revocar consentimiento de IA
                </Button>
              )}
            </Card.Content>
          </Card>
        );
      })}
      <Portal>
        <Dialog visible={confirmRevoke} onDismiss={() => setConfirmRevoke(false)}>
          <Dialog.Title>Revocar uso de IA</Dialog.Title>
          <Dialog.Content>
            <Text>
              Las sugerencias de IA quedarán desactivadas. El planificador manual seguirá
              disponible.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmRevoke(false)}>Cancelar</Button>
            <Button loading={revoke.isPending} onPress={() => revoke.mutate()}>
              Revocar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
