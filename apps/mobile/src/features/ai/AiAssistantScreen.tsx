import { zodResolver } from "@hookform/resolvers/zod";
import type { AiSuggestionResponse } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Portal, Text, useTheme } from "react-native-paper";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getActivity } from "@/core/api/activities";
import { requestAiSuggestion } from "@/core/api/ai";
import { getActivePlan } from "@/core/api/plans";
import { getProfile } from "@/core/api/profile";
import { createSubtask } from "@/core/api/subtasks";
import { appendRecognizedText } from "@/core/speech/dictation";
import {
  cancelSpeechRecognition,
  recognizeSpeech,
  SpeechRecognitionError,
  stopSpeechRecognition,
} from "@/core/speech/speech-recognition";
import { layout } from "@/core/theme/layout";
import { ActivityPicker } from "@/features/activities/ActivityPicker";
import type { RootStackParamList } from "@/navigation/types";
import { userMessage } from "@/shared/errors";
import { SelectField } from "@/shared/fields";
import { Button, Card, Dialog, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";

type UseCase = Exclude<AiSuggestionResponse, { kind: "manual" }>["useCase"];
const cases: Array<{ value: UseCase; label: string; help: string }> = [
  {
    value: "extract_activity",
    label: "Extraer actividad",
    help: "Convierte un texto en título y descripción para revisar.",
  },
  {
    value: "estimate_duration",
    label: "Sugerir duración",
    help: "Propone minutos a partir de una descripción.",
  },
  {
    value: "propose_subtasks",
    label: "Proponer subtareas",
    help: "Propone pasos para una actividad existente.",
  },
  {
    value: "explain_risk",
    label: "Explicar riesgo",
    help: "Narra un riesgo ya calculado sin cambiarlo.",
  },
  {
    value: "explain_replan",
    label: "Explicar replanificación",
    help: "Resume diferencias medidas de un plan.",
  },
];
const fallbackLabels = {
  not_configured: "La IA aún no está configurada. Usa el flujo manual.",
  rate_limited: "Se alcanzó el límite temporal. Inténtalo más tarde o continúa manualmente.",
  budget_exhausted: "Se alcanzó el presupuesto diario. Continúa manualmente.",
  invalid_output: "La respuesta no pasó la validación. Continúa manualmente.",
  provider_unavailable: "El proveedor no está disponible. Continúa manualmente.",
};
const formSchema = z.object({
  text: z.string().max(2000),
  activityId: z.string(),
  planId: z.string(),
  riskActivityId: z.string(),
});
type FormValues = z.infer<typeof formSchema>;

function requiredText(value: string, message: string) {
  const parsed = z
    .string()
    .trim()
    .min(1, message)
    .max(2000, "El texto supera 2000 caracteres.")
    .safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? message);
  return parsed.data;
}

function requiredId(value: string, message: string) {
  const parsed = z.uuid(message).safeParse(value);
  if (!parsed.success) throw new Error(message);
  return parsed.data;
}

const riskLevelLabels = { low: "bajo", medium: "medio", high: "alto" } as const;

export function AiAssistantScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [useCase, setUseCase] = useState<UseCase>("extract_activity");
  const [result, setResult] = useState<AiSuggestionResponse | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [confirmSubtasks, setConfirmSubtasks] = useState(false);
  const [subtaskContext, setSubtaskContext] = useState<{
    activityId: string;
    ids: string[];
  } | null>(null);
  const activePlan = useQuery({
    queryKey: ["active-plan"],
    queryFn: getActivePlan,
    retry: false,
  });
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: false,
  });
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { text: "", activityId: "", planId: "", riskActivityId: "" },
  });
  const selectedCase = cases.find((item) => item.value === useCase) ?? cases[0];
  const riskActivityId = watch("riskActivityId");
  const request = useMutation({
    mutationFn: (values: FormValues) => {
      let payload: unknown;
      if (useCase === "extract_activity" || useCase === "estimate_duration") {
        const text = requiredText(values.text, "Escribe el contenido.");
        payload = useCase === "extract_activity" ? { text } : { description: text };
      } else if (useCase === "propose_subtasks") {
        const activityId = requiredId(values.activityId, "Selecciona una actividad.");
        const description = requiredText(values.text, "Describe la actividad.");
        setSubtaskContext({ activityId, ids: [] });
        payload = { description };
      } else if (useCase === "explain_risk") {
        payload = {
          planId: requiredId(values.planId, "Selecciona o escribe un plan válido."),
          activityId: requiredId(values.riskActivityId, "Selecciona una actividad con riesgo."),
        };
      } else {
        payload = {
          planId: requiredId(values.planId, "Selecciona o escribe un plan válido."),
        };
      }
      return requestAiSuggestion(useCase, payload);
    },
    onSuccess: (response) => {
      setResult(response);
      if (response.kind === "suggestion" && response.useCase === "propose_subtasks")
        setSubtaskContext((current) =>
          current ? { ...current, ids: response.value.subtasks.map(() => uuidv4()) } : null,
        );
    },
  });
  const applySubtasks = useMutation({
    mutationFn: async () => {
      if (!subtaskContext || result?.kind !== "suggestion" || result.useCase !== "propose_subtasks")
        throw new Error("La propuesta ya no está disponible.");
      return Promise.all(
        result.value.subtasks.map((title, index) =>
          createSubtask(subtaskContext.activityId, {
            id: subtaskContext.ids[index] ?? uuidv4(),
            title,
            estimatedMinutes: null,
          }),
        ),
      );
    },
    onSuccess: () => {
      setConfirmSubtasks(false);
      if (subtaskContext)
        void queryClient.invalidateQueries({
          queryKey: ["subtasks", subtaskContext.activityId],
        });
    },
  });
  const riskItems = activePlan.data?.risk ?? [];
  // El riesgo solo trae IDs: se piden los títulos para mostrarlos en el selector.
  const riskActivities = useQueries({
    queries: riskItems.map((item) => ({
      queryKey: ["activity", item.activityId],
      queryFn: () => getActivity(item.activityId),
      retry: false,
    })),
  });
  const riskTitle = (id: string) =>
    riskActivities.find((query) => query.data?.id === id)?.data?.title ?? "Actividad";
  const canRequest = !offline && !request.isPending;

  useEffect(
    () => () => {
      void cancelSpeechRecognition().catch(() => undefined);
    },
    [],
  );

  const handleDictation = async () => {
    if (listening) {
      await stopSpeechRecognition().catch(() => undefined);
      return;
    }
    setVoiceError(null);
    setListening(true);
    try {
      const transcript = await recognizeSpeech(profile.data?.language === "en" ? "en-US" : "es-EC");
      setValue("text", appendRecognizedText(getValues("text"), transcript), {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch (error) {
      if (!(error instanceof SpeechRecognitionError && error.code === "CANCELLED")) {
        setVoiceError(error instanceof Error ? error.message : "No se pudo iniciar el dictado.");
      }
    } finally {
      setListening(false);
    }
  };

  return (
    <ScreenLayout keyboardShouldPersistTaps="handled" header={{ title: "Ayuda con IA" }}>
      <Text>
        Las respuestas son propuestas no confiables. Revisa y confirma antes de guardar cualquier
        cambio.
      </Text>
      <SelectField
        label="¿Qué necesitas?"
        value={useCase}
        options={cases.map((item) => ({ value: item.value, label: item.label }))}
        onChange={(value) => {
          setUseCase(value);
          setResult(null);
        }}
      />
      <Text variant="bodyMedium">{selectedCase.help}</Text>
      {(useCase === "extract_activity" ||
        useCase === "estimate_duration" ||
        useCase === "propose_subtasks") && (
        <View style={styles.group}>
          <Controller
            control={control}
            name="text"
            render={({ field }) => (
              <TextInput
                mode="outlined"
                multiline
                label={useCase === "extract_activity" ? "Texto de origen" : "Descripción"}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={!!errors.text}
              />
            )}
          />
          <Button
            mode="outlined"
            icon={listening ? "stop" : "microphone"}
            onPress={() => void handleDictation()}
            accessibilityLabel={listening ? "Detener dictado" : "Dictar texto"}
          >
            {listening ? "Detener dictado" : "Dictar texto"}
          </Button>
          <Text variant="bodySmall">
            Escucha hasta 12 segundos. El servicio de voz del dispositivo procesa el audio; NotesIA
            solo conserva el texto que revises.
          </Text>
          {voiceError && <Text accessibilityRole="alert">{voiceError}</Text>}
        </View>
      )}
      {useCase === "propose_subtasks" && (
        <Controller
          control={control}
          name="activityId"
          render={({ field }) => <ActivityPicker value={field.value} onChange={field.onChange} />}
        />
      )}
      {(useCase === "explain_risk" || useCase === "explain_replan") && (
        <View style={styles.group}>
          <Controller
            control={control}
            name="planId"
            render={({ field }) => (
              <TextInput
                mode="outlined"
                label="ID del plan"
                autoCapitalize="none"
                value={field.value}
                onChangeText={field.onChange}
              />
            )}
          />
          {activePlan.data && (
            <Button onPress={() => setValue("planId", activePlan.data?.id ?? "")}>
              Usar plan activo
            </Button>
          )}
        </View>
      )}
      {useCase === "explain_risk" && (
        <SelectField
          label="Actividad con riesgo"
          value={riskActivityId}
          disabled={!activePlan.data || riskItems.length === 0}
          options={riskItems.map((item) => ({
            value: item.activityId,
            label: `${riskTitle(item.activityId)} · riesgo ${riskLevelLabels[item.level]}`,
          }))}
          onChange={(value) => {
            setValue("planId", activePlan.data?.id ?? "");
            setValue("riskActivityId", value);
          }}
        />
      )}
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. La ayuda de IA requiere conexión.
        </Text>
      )}
      {request.isError && userMessage(request.error).includes("consentimiento") && (
        <Button onPress={() => navigation.navigate("Privacy")}>Revisar consentimiento</Button>
      )}
      <Button
        mode="contained"
        loading={request.isPending}
        disabled={!canRequest}
        onPress={() => void handleSubmit((values) => request.mutate(values))()}
      >
        Solicitar sugerencia
      </Button>
      {result && (
        <SuggestionResult
          result={result}
          originalText={getValues("text")}
          onCreateActivity={(draft) => navigation.navigate("ActivityForm", { draft })}
          onConfirmSubtasks={() => setConfirmSubtasks(true)}
          subtasksApplied={applySubtasks.isSuccess}
        />
      )}
      <Portal>
        <Dialog visible={confirmSubtasks} onDismiss={() => setConfirmSubtasks(false)}>
          <Dialog.Title>Crear subtareas propuestas</Dialog.Title>
          <Dialog.Content>
            <Text>
              Se crearán únicamente después de esta confirmación. Podrás editarlas o archivarlas
              desde la actividad.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmSubtasks(false)}>Cancelar</Button>
            <Button loading={applySubtasks.isPending} onPress={() => applySubtasks.mutate()}>
              Crear subtareas
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScreenLayout>
  );
}

function SuggestionResult({
  result,
  originalText,
  onCreateActivity,
  onConfirmSubtasks,
  subtasksApplied,
}: {
  result: AiSuggestionResponse;
  originalText: string;
  onCreateActivity(draft: {
    title?: string;
    description?: string;
    estimatedMinutes?: number;
  }): void;
  onConfirmSubtasks(): void;
  subtasksApplied: boolean;
}) {
  const content = useMemo(() => {
    if (result.kind === "manual")
      return <Text accessibilityRole="alert">{fallbackLabels[result.reason]}</Text>;
    if (result.useCase === "extract_activity")
      return (
        <>
          <Text variant="titleMedium">{result.value.title}</Text>
          <Text>{result.value.description}</Text>
          <Button mode="outlined" onPress={() => onCreateActivity(result.value)}>
            Revisar en nueva actividad
          </Button>
        </>
      );
    if (result.useCase === "estimate_duration")
      return (
        <>
          <Text variant="titleLarge">{result.value.minutes} minutos</Text>
          <Text>{result.value.reason}</Text>
          <Button
            mode="outlined"
            onPress={() =>
              onCreateActivity({
                description: originalText,
                estimatedMinutes: result.value.minutes,
              })
            }
          >
            Revisar en nueva actividad
          </Button>
        </>
      );
    if (result.useCase === "propose_subtasks")
      return (
        <>
          {result.value.subtasks.map((item) => (
            <Text key={item}>• {item}</Text>
          ))}
          <Button mode="outlined" disabled={subtasksApplied} onPress={onConfirmSubtasks}>
            {subtasksApplied ? "Subtareas creadas" : "Confirmar y crear subtareas"}
          </Button>
        </>
      );
    return <Text>{result.value.explanation}</Text>;
  }, [onConfirmSubtasks, onCreateActivity, originalText, result, subtasksApplied]);
  return (
    <Card mode="contained">
      <Card.Content style={styles.group}>
        <Text variant="titleMedium">Sugerencia para revisar</Text>
        {content}
        {result.kind === "suggestion" && (
          <Text variant="bodySmall">Prompt v{result.promptVersion} · requiere confirmación</Text>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
