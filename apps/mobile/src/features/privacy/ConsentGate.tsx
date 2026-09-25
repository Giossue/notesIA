import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Checkbox, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { acceptConsent, listConsents, listPrivacyDocuments } from "@/core/api/privacy";
import { signOut } from "@/core/auth/auth-client";
import { clearPrivateCache } from "@/core/auth/query-cache";
import { layout } from "@/core/theme/layout";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";

const required = { terms: "Términos de uso", privacy: "Política de privacidad" } as const;

/**
 * RF-37: antes de usar la app, el estudiante acepta la versión vigente de los
 * términos y la política de privacidad. Si se publica una versión nueva, se
 * vuelve a pedir. El consentimiento de IA es aparte y opcional (Privacidad).
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const offline = useNetInfo().isConnected === false;
  const documents = useQuery({
    queryKey: ["privacy-documents", "es"],
    queryFn: () => listPrivacyDocuments("es"),
    retry: false,
  });
  const consents = useQuery({ queryKey: ["consents"], queryFn: listConsents, retry: false });
  const accept = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await acceptConsent(id);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["consents"] }),
  });
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      await clearPrivateCache(queryClient);
      queryClient.setQueryData(["session"], null);
    },
  });

  if (documents.isPending || consents.isPending) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator accessibilityLabel="Cargando documentos" />
      </SafeAreaView>
    );
  }
  // Sin conexión no se puede comprobar: no se bloquea el uso sin conexión de la app.
  if ((documents.isError || consents.isError) && offline) return <>{children}</>;
  if (documents.isError || consents.isError) {
    const failed = documents.isError ? documents : consents;
    return (
      <SafeAreaView style={[styles.center, { padding: layout.pagePadding }]}>
        <Text accessibilityRole="alert">{userMessage(failed.error)}</Text>
        <Button onPress={() => void failed.refetch()}>Reintentar</Button>
      </SafeAreaView>
    );
  }

  const accepted = new Set(
    consents.data.filter((item) => item.decision === "accepted").map((item) => item.documentId),
  );
  const pending = documents.data.filter(
    (document) => document.type !== "ai" && !accepted.has(document.id),
  );
  if (pending.length === 0) return <>{children}</>;

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text variant="headlineSmall" style={styles.bold}>
            Antes de empezar
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Para usar NotesIA necesitamos tu consentimiento para tratar tus datos según estos
            documentos.
          </Text>
        </View>
        {pending.map((document) => (
          <Card key={document.id} mode="contained">
            <Card.Content style={styles.document}>
              <Text variant="titleMedium" style={styles.bold}>
                {required[document.type as keyof typeof required]} · versión {document.version}
              </Text>
              <Text selectable variant="bodyMedium">
                {document.content}
              </Text>
            </Card.Content>
          </Card>
        ))}
        <Checkbox.Item
          label="He leído y acepto estos documentos"
          status={agreed ? "checked" : "unchecked"}
          onPress={() => setAgreed((value) => !value)}
          position="leading"
          style={styles.checkbox}
          labelStyle={styles.checkboxLabel}
        />
        <Button
          mode="contained"
          icon="check"
          disabled={!agreed || accept.isPending}
          loading={accept.isPending}
          onPress={() => accept.mutate(pending.map((document) => document.id))}
        >
          Aceptar y continuar
        </Button>
        <Button mode="text" icon="logout" onPress={() => logout.mutate()}>
          Cerrar sesión
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  content: { padding: layout.pagePadding, gap: layout.sectionGap },
  heading: { gap: 6 },
  bold: { fontWeight: "700" },
  document: { gap: 8 },
  checkbox: { paddingHorizontal: 0 },
  checkboxLabel: { textAlign: "left" },
});
