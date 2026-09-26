import type { ReportCreate } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NativeModules, Platform, StyleSheet, View } from "react-native";
import { HelperText, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { createReport } from "@/core/api/reports";
import { layout, sharedStyles } from "@/core/theme/layout";
import { FormSection, SelectField } from "@/shared/fields";
import { Button, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { showToast } from "@/shared/Toast";
import { reportTypeLabels } from "./report-labels";

type ReportType = ReportCreate["type"];

export function ReportFormScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const offline = useNetInfo().isConnected === false;
  const [id] = useState(() => uuidv4());
  const [type, setType] = useState<ReportType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () =>
      createReport({
        id,
        type,
        title: title.trim(),
        description: description.trim(),
        // Solo datos técnicos, para que soporte reproduzca el problema.
        context: {
          platform: Platform.OS,
          osVersion: String(Platform.Version).slice(0, 40),
          appVersion: (NativeModules.NotesIAConfig?.appVersion as string | undefined) ?? null,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      showToast("Reporte enviado. Te avisaremos cuando soporte responda.", "info");
      navigation.goBack();
    },
  });
  const submit = () => {
    if (!title.trim()) return setError("Escribe un título corto.");
    if (!description.trim()) return setError("Cuéntanos qué pasó.");
    setError(null);
    send.mutate();
  };
  return (
    <ScreenLayout keyboardShouldPersistTaps="handled" header={{ title: "Reportar un problema" }}>
      <View style={styles.form}>
        <FormSection title="Tipo">
          <SelectField
            label="¿Sobre qué es?"
            value={type}
            options={(Object.keys(reportTypeLabels) as ReportType[]).map((value) => ({
              value,
              label: reportTypeLabels[value],
            }))}
            onChange={setType}
          />
        </FormSection>
        <FormSection title="Detalles">
          <TextInput
            label="Título"
            mode="outlined"
            value={title}
            maxLength={160}
            onChangeText={setTitle}
            accessibilityLabel="Título del reporte"
          />
          <TextInput
            label="¿Qué pasó?"
            mode="outlined"
            multiline
            numberOfLines={6}
            maxLength={5000}
            value={description}
            onChangeText={setDescription}
            accessibilityLabel="Descripción del reporte"
          />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Si es un error, cuenta qué estabas haciendo y qué esperabas que pasara. Se agrega la
            versión de la app y del teléfono.
          </Text>
        </FormSection>
        {error && <HelperText type="error">{error}</HelperText>}
        {offline && (
          <Text style={{ color: theme.colors.error }}>Sin conexión. Conéctate para enviar.</Text>
        )}
        <Button
          mode="contained"
          icon="send"
          loading={send.isPending}
          disabled={offline || send.isPending}
          onPress={submit}
          contentStyle={sharedStyles.actionContent}
        >
          Enviar reporte
        </Button>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({ form: { gap: layout.sectionGap } });
