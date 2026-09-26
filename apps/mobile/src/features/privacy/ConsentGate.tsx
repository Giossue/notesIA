import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { AppState, StyleSheet, useWindowDimensions, View } from "react-native";
import { Portal, Text, useTheme } from "react-native-paper";
import { acceptConsent, listConsents, listPrivacyDocuments } from "@/core/api/privacy";
import { signOut } from "@/core/auth/auth-client";
import { clearPrivateCache } from "@/core/auth/query-cache";
import { HeroBackdrop, HeroStatus, HeroStatusBar, heroColors } from "@/features/auth/AuthHero";
import { userMessage } from "@/shared/errors";
import { Button, Dialog } from "@/shared/paper";
import { LegalConsentCheckbox, requiredDocuments } from "./LegalConsent";

/**
 * RF-37: los términos y la política de privacidad se aceptan al registrarse.
 * Si después se publica una versión nueva, la app se bloquea con este diálogo
 * hasta aceptarla; la API responde CONSENT_REQUIRED mientras tanto.
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const { height } = useWindowDimensions();
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

  const accepted = new Set(
    consents.data?.filter((item) => item.decision === "accepted").map((item) => item.documentId) ??
      [],
  );
  const pending = requiredDocuments(documents.data ?? []).filter(
    (document) => !accepted.has(document.id),
  );

  // Al volver a la app se comprueba de nuevo por si se publicó una versión nueva.
  const { refetch: refetchDocuments } = documents;
  const { refetch: refetchConsents } = consents;
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void refetchDocuments();
      void refetchConsents();
    });
    return () => subscription.remove();
  }, [refetchDocuments, refetchConsents]);

  if (documents.isPending || consents.isPending) {
    return <HeroStatus label="Cargando documentos" />;
  }
  // Sin conexión no se puede comprobar: no se bloquea el uso sin conexión de la app.
  if ((documents.isError || consents.isError) && offline) return <>{children}</>;
  if (documents.isError || consents.isError) {
    const failed = documents.isError ? documents : consents;
    return (
      <HeroStatus
        message={userMessage(failed.error)}
        action={
          <Button
            mode="contained"
            onPress={() => void failed.refetch()}
            style={styles.pill}
            contentStyle={styles.pillContent}
          >
            Reintentar
          </Button>
        }
      />
    );
  }
  if (pending.length === 0) return <>{children}</>;

  // La app queda detrás, sin montar, hasta aceptar: la API también la bloquea.
  return (
    <View style={styles.blocked}>
      <HeroStatusBar />
      <HeroBackdrop height={height} />
      <ConsentDialog
        documents={pending}
        accepting={accept.isPending}
        error={accept.isError ? userMessage(accept.error) : undefined}
        onAccept={() => accept.mutate(pending.map((document) => document.id))}
      />
    </View>
  );
}

/** Diálogo obligatorio: no se cierra tocando fuera ni con atrás. */
function ConsentDialog({
  documents,
  accepting,
  error,
  onAccept,
}: {
  documents: ReturnType<typeof requiredDocuments>;
  accepting: boolean;
  error?: string;
  onAccept(): void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      await clearPrivateCache(queryClient);
      queryClient.setQueryData(["session"], null);
    },
  });
  return (
    <Portal>
      <Dialog visible dismissable={false} dismissableBackButton={false}>
        <Dialog.Title>Actualizamos nuestros documentos</Dialog.Title>
        <Dialog.Content style={styles.content}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Para seguir usando NotesIA, acepta la versión vigente.
          </Text>
          <LegalConsentCheckbox
            documents={documents}
            checked={agreed}
            onToggle={() => setAgreed((value) => !value)}
            error={error}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button icon="logout" onPress={() => logout.mutate()} disabled={logout.isPending}>
            Cerrar sesión
          </Button>
          <Button
            mode="contained"
            icon="check"
            disabled={!agreed || accepting}
            loading={accepting}
            onPress={onAccept}
          >
            Aceptar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  blocked: { flex: 1, backgroundColor: heroColors.background },
  content: { gap: 12 },
  pill: { borderRadius: 999 },
  pillContent: { minHeight: 52 },
});
