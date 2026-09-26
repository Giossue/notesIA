import type { AssistantAction } from "@notesia/contracts";
import { useNetInfo } from "@react-native-community/netinfo";
import { type RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ActivityIndicator, Icon, IconButton, Text, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { v4 as uuidv4 } from "uuid";
import { sendAssistantMessage } from "@/core/api/ai";
import { OfflineQueuedError } from "@/core/api/client";
import { getProfile } from "@/core/api/profile";
import {
  addChatMessage,
  type ChatAction,
  type ChatMessage,
  chatHistory,
  updateChatAction,
  useChatMessages,
} from "@/core/assistant/chat-store";
import { appendRecognizedText } from "@/core/speech/dictation";
import {
  cancelSpeechRecognition,
  recognizeSpeech,
  SpeechRecognitionError,
  stopSpeechRecognition,
} from "@/core/speech/speech-recognition";
import { speak, stopSpeaking } from "@/core/speech/tts";
import { layout } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { userMessage } from "@/shared/errors";
import { Button, Card, TextInput } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { UserAvatar } from "@/shared/UserAvatar";
import { applyAssistantAction, describeAction } from "./assistant-actions";

const fallbackMessages = {
  not_configured: "El asistente aún no está configurado. Puedes crear tus actividades a mano.",
  rate_limited: "Hiciste muchas consultas seguidas. Espera un momento e inténtalo de nuevo.",
  budget_exhausted: "Se agotó el uso de IA de hoy. Mañana vuelve a estar disponible.",
  invalid_output: "No entendí bien la respuesta. ¿Puedes decirlo de otra forma?",
  provider_unavailable: "El servicio de IA no responde ahora. Inténtalo en un momento.",
};
const suggestions = [
  "¿Qué tengo esta semana?",
  "Tengo examen de cálculo el viernes a las 10",
  "Tengo clase de inglés mañana de 8 a 10",
];
// La preferencia de voz dura mientras la app está abierta.
let voiceEnabled = false;

export function AssistantChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const messages = useChatMessages();
  const offline = useNetInfo().isConnected === false;
  const [draft, setDraft] = useState("");
  const [voice, setVoice] = useState(voiceEnabled);
  const [listening, setListening] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);

  const send = useMutation({
    // El historial se toma antes de agregar el mensaje nuevo a la conversación.
    mutationFn: ({ text, history }: { text: string; history: ReturnType<typeof chatHistory> }) =>
      sendAssistantMessage(text, history),
    onMutate: ({ text }) => {
      addChatMessage({ id: uuidv4(), role: "user", text, actions: [] });
    },
    onSuccess: (result) => {
      if (result.kind === "manual") {
        addChatMessage({
          id: uuidv4(),
          role: "assistant",
          text: fallbackMessages[result.reason],
          actions: [],
          notice: "error",
        });
        return;
      }
      addChatMessage({
        id: uuidv4(),
        role: "assistant",
        text: result.reply,
        actions: result.actions.map((action) => ({ id: uuidv4(), action, state: "pending" })),
      });
      if (voiceEnabled) speak(result.reply);
    },
    onError: (error) => {
      addChatMessage({
        id: uuidv4(),
        role: "assistant",
        text: userMessage(error),
        actions: [],
        notice: "error",
      });
    },
    // Los errores se muestran dentro del chat, no como toast.
    meta: { silent: true },
  });

  const submit = (text: string) => {
    const message = text.trim();
    if (!message || send.isPending || offline) return;
    stopSpeaking();
    setDraft("");
    send.mutate({ text: message, history: chatHistory() });
  };

  // Abierto con un mensaje (por ejemplo "Planifica mi semana" desde la Agenda): se envía una vez.
  const route = useRoute<RouteProp<RootStackParamList, "AiAssistant">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const prompt = route.params?.prompt;
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo reacciona a un mensaje nuevo
  useEffect(() => {
    if (!prompt) return;
    navigation.setParams({ prompt: undefined });
    if (offline || send.isPending) setDraft(prompt);
    else submit(prompt);
  }, [prompt]);

  const dictate = async () => {
    // Detener termina la frase y conserva lo dictado.
    if (listening) {
      await stopSpeechRecognition().catch(() => cancelSpeechRecognition());
      return;
    }
    // Que el micrófono no escuche la voz del asistente.
    stopSpeaking();
    setDictationError(null);
    setListening(true);
    // Lo dictado se va escribiendo a continuación de lo que ya había.
    const before = draft;
    try {
      const transcript = await recognizeSpeech("es-EC", (partial) =>
        setDraft(appendRecognizedText(before, partial)),
      );
      setDraft(appendRecognizedText(before, transcript));
    } catch (error) {
      if (!(error instanceof SpeechRecognitionError && error.code === "CANCELLED"))
        setDictationError(
          error instanceof SpeechRecognitionError ? error.message : "No se pudo usar el micrófono.",
        );
    } finally {
      setListening(false);
    }
  };

  const toggleVoice = () => {
    voiceEnabled = !voiceEnabled;
    setVoice(voiceEnabled);
    if (!voiceEnabled) stopSpeaking();
  };

  const composer = (
    <View
      style={[
        styles.composer,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
          paddingBottom: insets.bottom + 10,
        },
      ]}
    >
      {offline && (
        <Text variant="bodySmall" style={{ color: theme.colors.error }}>
          Sin conexión. El asistente necesita internet.
        </Text>
      )}
      {dictationError && (
        <Text variant="bodySmall" style={{ color: theme.colors.error }}>
          {dictationError}
        </Text>
      )}
      <View style={styles.composerRow}>
        <IconButton
          icon={listening ? "stop" : "microphone"}
          mode={listening ? "contained" : undefined}
          onPress={() => void dictate()}
          accessibilityLabel={listening ? "Detener dictado" : "Dictar mensaje"}
          disabled={send.isPending}
        />
        <TextInput
          mode="outlined"
          dense
          placeholder={listening ? "Escuchando…" : "Escribe o dicta un mensaje"}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={2000}
          style={styles.input}
          outlineStyle={styles.inputOutline}
          // Paper deja arriba el texto multilínea: se centra con relleno parejo.
          contentStyle={styles.inputContent}
          accessibilityLabel="Mensaje para el asistente"
        />
        <IconButton
          icon="send-outline"
          mode="contained"
          onPress={() => submit(draft)}
          disabled={!draft.trim() || send.isPending || offline}
          accessibilityLabel="Enviar mensaje"
        />
      </View>
    </View>
  );

  return (
    <ScreenLayout
      header={{
        title: "Asistente",
        right: {
          icon: voice ? "volume-high" : "volume-off",
          label: voice ? "Silenciar respuestas" : "Leer respuestas en voz alta",
          onPress: toggleVoice,
        },
      }}
      keyboardShouldPersistTaps="handled"
      footer={composer}
      stickToBottom
    >
      {messages.length === 0 && <Welcome onPick={submit} disabled={offline || send.isPending} />}
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {send.isPending && (
        <View style={styles.thinking}>
          <ActivityIndicator size="small" />
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Pensando…</Text>
        </View>
      )}
    </ScreenLayout>
  );
}

function Welcome({ onPick, disabled }: { onPick(text: string): void; disabled: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.welcome}>
      <View style={[styles.welcomeIcon, { backgroundColor: theme.colors.primaryContainer }]}>
        <Icon source="robot" size={32} color={theme.colors.primary} />
      </View>
      <Text variant="titleMedium" style={styles.bold}>
        ¿En qué te ayudo?
      </Text>
      <Text style={[styles.center, { color: theme.colors.onSurfaceVariant }]}>
        Cuéntame tus tareas, exámenes o clases y las organizo contigo. Siempre te pediré confirmar
        antes de cambiar algo.
      </Text>
      <View style={styles.suggestions}>
        {suggestions.map((text) => (
          <Pressable
            key={text}
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onPick(text)}
            style={({ pressed }) => [
              styles.suggestion,
              { backgroundColor: pressed ? theme.colors.primaryContainer : theme.colors.surface },
            ]}
          >
            <Icon source="send-outline" size={18} color={theme.colors.primary} />
            <Text style={[styles.flex, { color: theme.colors.onSurface }]}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const mine = message.role === "user";
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const avatar = mine ? (
    <UserAvatar avatar={profile.data?.avatar} size={30} />
  ) : (
    <View style={[styles.botAvatar, { backgroundColor: theme.colors.primaryContainer }]}>
      <Icon source="robot" size={18} color={theme.colors.primary} />
    </View>
  );
  return (
    <View style={[styles.messageRow, mine && styles.messageRowMine]}>
      {avatar}
      <MessageBody message={message} mine={mine} />
    </View>
  );
}

function MessageBody({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.messageBlock, mine ? styles.mine : styles.theirs]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: theme.colors.primary }
            : {
                backgroundColor: message.notice
                  ? theme.colors.errorContainer
                  : theme.colors.surface,
              },
        ]}
      >
        <Text
          style={{
            color: mine
              ? theme.colors.onPrimary
              : message.notice
                ? theme.colors.onErrorContainer
                : theme.colors.onSurface,
          }}
        >
          {message.text}
        </Text>
      </View>
      {!mine && message.actions.length > 0 && (
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Propuesta generada con IA · revísala antes de confirmar
        </Text>
      )}
      {message.actions.map((item) => (
        <ActionCard key={item.id} messageId={message.id} item={item} />
      ))}
    </View>
  );
}

function ActionCard({ messageId, item }: { messageId: string; item: ChatAction }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { icon, heading, title, details } = describeAction(item.action);

  const confirm = async () => {
    updateChatAction(messageId, item.id, { state: "applying", error: undefined });
    try {
      await applyAssistantAction(item.action);
      updateChatAction(messageId, item.id, { state: "applied" });
    } catch (error) {
      // Sin conexión queda en la cola y se envía después: cuenta como hecho.
      if (error instanceof OfflineQueuedError) {
        updateChatAction(messageId, item.id, { state: "applied" });
      } else {
        updateChatAction(messageId, item.id, { state: "failed", error: userMessage(error) });
        return;
      }
    }
    void queryClient.invalidateQueries();
  };

  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.cardContent}>
        <View style={styles.cardHead}>
          <View style={[styles.cardIcon, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon source={icon} size={18} color={theme.colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {heading}
            </Text>
            <Text variant="titleSmall" style={styles.bold}>
              {title}
            </Text>
          </View>
        </View>
        {details.map((detail) => (
          <Text key={detail} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {detail}
          </Text>
        ))}
        {item.state === "applied" && (
          <Text style={[styles.bold, { color: theme.colors.primary }]}>Hecho</Text>
        )}
        {item.state === "dismissed" && (
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Descartada</Text>
        )}
        {item.state === "failed" && (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            {item.error}
          </Text>
        )}
        {(item.state === "pending" || item.state === "applying" || item.state === "failed") && (
          <View style={styles.cardActions}>
            <Button
              mode="contained"
              icon="check"
              loading={item.state === "applying"}
              disabled={item.state === "applying"}
              onPress={() => void confirm()}
            >
              {item.state === "failed" ? "Reintentar" : "Confirmar"}
            </Button>
            <Button
              mode="text"
              icon="pencil-outline"
              disabled={item.state === "applying"}
              onPress={() => openEditor(navigation, item.action)}
            >
              Editar
            </Button>
            <Button
              mode="text"
              icon="close"
              disabled={item.state === "applying"}
              onPress={() => updateChatAction(messageId, item.id, { state: "dismissed" })}
            >
              Descartar
            </Button>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

/** Abre el formulario de siempre con la propuesta, para ajustarla a mano. */
function openEditor(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  action: AssistantAction,
) {
  const localDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString("sv-SE") : undefined;
  switch (action.type) {
    case "create_activity":
      navigation.navigate("ActivityForm", {
        draft: {
          title: action.activity.title,
          description: action.activity.description ?? undefined,
          estimatedMinutes: action.activity.estimatedMinutes ?? undefined,
        },
        date: localDate(action.activity.deadlineAt),
      });
      return;
    case "create_event":
      navigation.navigate("EventForm", { date: localDate(action.event.startsAt) });
      return;
    case "update_event":
    case "archive_event":
      navigation.navigate("EventForm", { id: action.eventId });
      return;
    default:
      navigation.navigate("ActivityForm", { id: action.activityId });
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: "700" },
  center: { textAlign: "center" },
  welcome: { alignItems: "center", gap: 10, paddingVertical: 24 },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestions: { alignSelf: "stretch", gap: 8, marginTop: 8 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  messageRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 12 },
  messageRowMine: { flexDirection: "row-reverse" },
  botAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  messageBlock: { gap: 6, flexShrink: 1, maxWidth: "82%" },
  mine: { alignItems: "flex-end" },
  theirs: { flex: 1, alignItems: "flex-start" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  card: { borderRadius: layout.cardRadius, alignSelf: "stretch" },
  cardContent: { gap: 6 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 4,
  },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  input: { flex: 1, maxHeight: 120, textAlignVertical: "center" },
  inputOutline: { borderRadius: 22 },
  inputContent: { textAlignVertical: "center", paddingTop: 10, paddingBottom: 10 },
});
