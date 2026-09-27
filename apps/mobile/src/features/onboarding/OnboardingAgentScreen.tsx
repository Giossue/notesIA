import type { AssistantMessage, OnboardingDraft, Profile } from "@notesia/contracts";
import { shiftLocalDate } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Icon, IconButton, Portal, ProgressBar, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { sendOnboardingMessage } from "@/core/api/ai";
import { appendRecognizedText } from "@/core/speech/dictation";
import {
  cancelSpeechRecognition,
  recognizeSpeech,
  SpeechRecognitionError,
  stopSpeechRecognition,
} from "@/core/speech/speech-recognition";
import { speak, stopSpeaking } from "@/core/speech/tts";
import { layout } from "@/core/theme/layout";
import { plainText } from "@/features/ai/plain-text";
import { dailyChoices } from "@/features/availability/WeeklyHours";
import { userMessage } from "@/shared/errors";
import { TypingDots } from "@/shared/motion";
import { Button, Card, Dialog, TextInput } from "@/shared/paper";
import { useHideSplash } from "@/shared/splash";
import { fromDraft, type WeekSetup } from "./save-week";
import { useLocalToday, useSaveWeek } from "./useSaveWeek";

type Message = { id: number; role: "user" | "assistant"; text: string; notice?: boolean };

const emptyDraft: OnboardingDraft = { studyHours: [], maxDailyMinutes: null, commitments: [] };
const dayShort = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const letters = ["L", "M", "M", "J", "V", "S", "D"];
const kindLabels = { class: "Clase", work: "Trabajo", other: "Otro" } as const;
const unavailable = {
  not_configured: "El asistente aún no está disponible.",
  rate_limited: "Hiciste muchas consultas seguidas.",
  budget_exhausted: "Se agotó el uso de IA de hoy.",
  invalid_output: "No entendí bien la respuesta.",
  provider_unavailable: "El servicio de IA no responde ahora.",
};

/** Lo mínimo para guardar: un horario de estudio y fecha de fin en cada compromiso. */
const ready = (draft: OnboardingDraft) =>
  draft.studyHours.length > 0 && draft.commitments.every((item) => item.until !== null);

/**
 * Configuración inicial conversada: el estudiante cuenta su semana por voz o
 * texto, el agente arma el horario y los compromisos y pregunta solo lo que
 * falte. Nada se guarda hasta que el estudiante revisa el resumen y pulsa Guardar.
 */
export function OnboardingAgentScreen({
  profile,
  onManual,
}: {
  profile: Profile;
  onManual(initial?: WeekSetup): void;
}) {
  useHideSplash();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const { timeZone, today } = useLocalToday(profile.timeZone);
  const { finish, progress } = useSaveWeek(timeZone, today);
  const firstName = profile.displayName.split(" ")[0];
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      text: `¡Hola, ${firstName}! Armemos tu semana. Cuéntame qué clases o trabajo tienes (días y horas) y en qué momentos puedes estudiar. Puedes hablarme o escribirme.`,
    },
  ]);
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [aiDown, setAiDown] = useState<string | null>(null);
  // El resumen aparece recién cuando el agente considera que ya no falta nada.
  const [complete, setComplete] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const spokeLast = useRef(false);
  const nextId = useRef(1);
  const scroller = useRef<ScrollView>(null);

  const add = (message: Omit<Message, "id">) =>
    setMessages((current) => [...current, { ...message, id: nextId.current++ }]);

  const send = useMutation({
    mutationFn: ({ message, history }: { message: string; history: AssistantMessage[] }) =>
      sendOnboardingMessage(message, history, draft),
    onMutate: ({ message }) => add({ role: "user", text: message }),
    onSuccess: (result) => {
      if (result.kind === "manual") {
        setAiDown(unavailable[result.reason]);
        return;
      }
      setDraft(result.draft);
      setComplete(result.complete);
      add({ role: "assistant", text: result.reply });
      if (spokeLast.current) speak(result.reply);
    },
    onError: (error) => add({ role: "assistant", text: userMessage(error), notice: true }),
    meta: { silent: true },
  });

  const submit = () => {
    const message = text.trim();
    if (!message || send.isPending || offline) return;
    stopSpeaking();
    setText("");
    send.mutate({
      message,
      history: messages
        .filter((item) => !item.notice)
        .slice(-16)
        .map((item) => ({ role: item.role, text: item.text.slice(0, 2000) })),
    });
  };

  const dictate = async () => {
    if (listening) {
      await stopSpeechRecognition().catch(() => cancelSpeechRecognition());
      return;
    }
    stopSpeaking();
    setMicError(null);
    setListening(true);
    const before = text;
    try {
      const transcript = await recognizeSpeech("es-EC", (partial) =>
        setText(appendRecognizedText(before, partial)),
      );
      setText(appendRecognizedText(before, transcript));
      spokeLast.current = true;
    } catch (error) {
      if (!(error instanceof SpeechRecognitionError && error.code === "CANCELLED"))
        setMicError(
          error instanceof SpeechRecognitionError ? error.message : "No se pudo usar el micrófono.",
        );
    } finally {
      setListening(false);
    }
  };

  const defaultUntil = shiftLocalDate(today, 16 * 7);
  const canSave = ready(draft) && !offline && !finish.isPending;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Icon source="robot" size={28} color={theme.colors.primary} />
        <Text variant="titleLarge" style={[styles.bold, styles.flex]}>
          Armemos tu semana
        </Text>
        <Button
          compact
          mode="outlined"
          icon="form-select"
          onPress={() => onManual(fromDraft(draft, defaultUntil))}
        >
          Llenar a mano
        </Button>
      </View>
      <ScrollView
        ref={scroller}
        persistentScrollbar
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.bubble,
              message.role === "user"
                ? [styles.mine, { backgroundColor: theme.colors.primary }]
                : {
                    backgroundColor: message.notice
                      ? theme.colors.errorContainer
                      : theme.colors.surface,
                  },
            ]}
          >
            <Text
              style={{
                color:
                  message.role === "user"
                    ? theme.colors.onPrimary
                    : message.notice
                      ? theme.colors.onErrorContainer
                      : theme.colors.onSurface,
              }}
            >
              {message.role === "user" ? message.text : plainText(message.text)}
            </Text>
          </View>
        ))}
        {send.isPending && (
          <View style={[styles.bubble, styles.typing, { backgroundColor: theme.colors.surface }]}>
            <TypingDots color={theme.colors.onSurfaceVariant} />
          </View>
        )}
        {aiDown && (
          <Card mode="contained" style={{ backgroundColor: theme.colors.errorContainer }}>
            <Card.Content style={styles.group}>
              <Text style={{ color: theme.colors.onErrorContainer }}>
                {aiDown} Sigamos con el formulario; lo que ya armamos se conserva.
              </Text>
              <Button
                mode="contained"
                icon="form-select"
                onPress={() => onManual(fromDraft(draft, defaultUntil))}
              >
                Usar el formulario
              </Button>
            </Card.Content>
          </Card>
        )}
        {complete && (
          <Card
            mode="contained"
            style={[styles.readyCard, { backgroundColor: theme.colors.primaryContainer }]}
            onPress={() => setReviewing(true)}
            accessibilityLabel="Revisar tu semana"
          >
            <Card.Content style={styles.readyRow}>
              <Icon source="calendar-check" size={28} color={theme.colors.primary} />
              <View style={styles.flex}>
                <Text variant="titleMedium" style={styles.bold}>
                  Tu semana está lista
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Toca para revisarla antes de guardar
                </Text>
              </View>
              <Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      <View
        style={[
          styles.composer,
          { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant },
        ]}
      >
        {offline && (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            Sin conexión. Conéctate para continuar.
          </Text>
        )}
        {micError && (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            {micError}
          </Text>
        )}
        {finish.isPending && progress.total > 0 && (
          <View style={styles.group}>
            <ProgressBar progress={progress.saved / progress.total} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Guardando tu semana… {progress.saved}/{progress.total}
            </Text>
          </View>
        )}
        {finish.isError && (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            {userMessage(finish.error)}
          </Text>
        )}
        <View style={styles.row}>
          <IconButton
            icon={listening ? "stop-circle" : "microphone"}
            iconColor={listening ? theme.colors.error : theme.colors.primary}
            accessibilityLabel={listening ? "Detener dictado" : "Hablar"}
            disabled={offline || send.isPending || !!aiDown}
            onPress={() => void dictate()}
          />
          <TextInput
            mode="outlined"
            dense
            multiline
            placeholder={listening ? "Te escucho…" : "Escribe o dicta"}
            value={text}
            onChangeText={(value) => {
              setText(value);
              spokeLast.current = false;
            }}
            style={styles.input}
            outlineStyle={styles.inputOutline}
            // Paper deja arriba el texto multilínea: se centra con relleno parejo.
            contentStyle={styles.inputContent}
            accessibilityLabel="Mensaje para el asistente"
          />
          <IconButton
            icon="send"
            mode="contained"
            accessibilityLabel="Enviar"
            disabled={!text.trim() || send.isPending || offline || !!aiDown}
            onPress={submit}
          />
        </View>
        <Button
          mode="contained"
          icon="check"
          loading={finish.isPending}
          disabled={!canSave}
          onPress={() => finish.mutate(fromDraft(draft, defaultUntil))}
        >
          {finish.isError ? "Reintentar" : "Guardar y empezar"}
        </Button>
      </View>
      <Portal>
        <Dialog visible={reviewing} onDismiss={() => setReviewing(false)}>
          <Dialog.Title>Tu semana</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView persistentScrollbar contentContainerStyle={styles.dialogContent}>
              <WeekSummary draft={draft} />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button mode="outlined" icon="pencil-outline" onPress={() => setReviewing(false)}>
              Seguir ajustando
            </Button>
            <Button
              mode="contained"
              icon="check"
              disabled={!canSave}
              onPress={() => {
                setReviewing(false);
                finish.mutate(fromDraft(draft, defaultUntil));
              }}
            >
              Guardar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

/** Resumen de lo que el agente lleva armado. */
function WeekSummary({ draft }: { draft: OnboardingDraft }) {
  const theme = useTheme();
  const muted = { color: theme.colors.onSurfaceVariant };
  const byDay = dayShort
    .map((label, index) => ({
      label,
      slots: draft.studyHours.filter((row) => row.weekday === index + 1),
    }))
    .filter((day) => day.slots.length > 0);
  const daily = dailyChoices.find((choice) => Number(choice.value) === draft.maxDailyMinutes);
  return (
    <View style={styles.group}>
      <Text variant="labelLarge">Horario de estudio</Text>
      {byDay.length === 0 ? (
        <Text variant="bodySmall" style={muted}>
          Aún nada.
        </Text>
      ) : (
        byDay.map((day) => (
          <Text key={day.label} variant="bodyMedium">
            {day.label}: {day.slots.map((slot) => `${slot.start}–${slot.end}`).join(", ")}
          </Text>
        ))
      )}
      <Text variant="bodyMedium" style={muted}>
        Máximo al día:{" "}
        {draft.maxDailyMinutes === null
          ? "sin definir (3 h)"
          : (daily?.label ?? `${Math.round(draft.maxDailyMinutes / 60)} h`)}
      </Text>
      <Text variant="labelLarge">Compromisos fijos</Text>
      {draft.commitments.length === 0 ? (
        <Text variant="bodySmall" style={muted}>
          Ninguno por ahora.
        </Text>
      ) : (
        draft.commitments.map((item) => (
          <View key={`${item.title}-${item.start}-${item.weekdays.join("")}`}>
            <Text variant="bodyMedium">
              {item.title} · {kindLabels[item.kind]}
            </Text>
            <Text variant="bodySmall" style={muted}>
              {item.weekdays.map((day) => letters[day - 1]).join(" ")} · {item.start}–{item.end}
              {item.until ? ` · hasta ${item.until}` : ""}
            </Text>
            {!item.until && (
              <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                Falta hasta qué fecha se repite.
              </Text>
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: layout.pagePadding,
    paddingVertical: 10,
  },
  content: { padding: layout.pagePadding, gap: 10, paddingBottom: 24 },
  bold: { fontWeight: "700" },
  flex: { flex: 1 },
  group: { gap: 6 },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "88%",
    alignSelf: "flex-start",
  },
  mine: { alignSelf: "flex-end" },
  typing: { paddingVertical: 14 },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 2 },
  input: { flex: 1, maxHeight: 120, textAlignVertical: "center" },
  inputOutline: { borderRadius: 22 },
  inputContent: { textAlignVertical: "center", paddingTop: 10, paddingBottom: 10 },
  readyCard: { borderRadius: layout.cardRadius, marginTop: 8 },
  readyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dialogScroll: { maxHeight: 440, paddingHorizontal: 0 },
  dialogContent: { paddingHorizontal: 24, paddingVertical: 8 },
});
