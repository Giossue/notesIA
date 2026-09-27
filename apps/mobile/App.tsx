import { configureZodSpanish } from "@notesia/contracts";
import { NavigationContainer } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApiError, OfflineQueuedError } from "@/core/api/client";
import { getProfile } from "@/core/api/profile";
import { getCurrentUser } from "@/core/auth/auth-client";
import { clearPrivateCache } from "@/core/auth/query-cache";
import { getSessionCookie } from "@/core/auth/session-storage";
import { OfflineSyncProvider } from "@/core/offline/OfflineSyncProvider";
import { PushRegistrationProvider } from "@/core/push/PushRegistrationProvider";
import { AppearanceProvider } from "@/core/theme/AppearanceProvider";
import { ActivityFormScreen } from "@/features/activities/ActivityFormScreen";
import { AgendaScreen } from "@/features/activities/AgendaScreen";
import { ListsScreen } from "@/features/activities/ListsScreen";
import { AssistantChatScreen } from "@/features/ai/AssistantChatScreen";
import { HeroStatus } from "@/features/auth/AuthHero";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { AvailabilityScreen } from "@/features/availability/AvailabilityScreen";
import { EventFormScreen } from "@/features/calendar/EventFormScreen";
import { HomeScreen } from "@/features/home/HomeScreen";
import { AlertsScreen } from "@/features/notifications/AlertsScreen";
import { NotificationsScreen } from "@/features/notifications/NotificationsScreen";
import { PushPermissionPrompt } from "@/features/notifications/PushPermissionPrompt";
import { OfflineChangesScreen } from "@/features/offline/OfflineChangesScreen";
import { OnboardingAgentScreen } from "@/features/onboarding/OnboardingAgentScreen";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import type { WeekSetup } from "@/features/onboarding/save-week";
import { ConsentGate } from "@/features/privacy/ConsentGate";
import { PrivacyScreen } from "@/features/privacy/PrivacyScreen";
import { ProfileEditScreen } from "@/features/profile/ProfileEditScreen";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { ProgressScreen } from "@/features/progress/ProgressScreen";
import { ReportFormScreen } from "@/features/reports/ReportFormScreen";
import { ReportsScreen } from "@/features/reports/ReportsScreen";
import { StreakCelebration } from "@/features/streak/StreakCelebration";
import { FloatingNavBar, type MainTab } from "@/navigation/FloatingNavBar";
import { flushPendingNavigation, navigationRef } from "@/navigation/navigation-ref";
import type { RootStackParamList, TabParams } from "@/navigation/types";
import { userMessage } from "@/shared/errors";
import { Button } from "@/shared/paper";
import { hideSplash } from "@/shared/splash";
import { showToast } from "@/shared/Toast";
import { adoptDeviceTimeZone } from "@/shared/time-zones";

configureZodSpanish();

// Se publicó una versión nueva de los términos mientras la app estaba abierta:
// al refrescar lo que falta aceptar, ConsentGate bloquea la app con su diálogo.
const isConsentRequired = (error: unknown) =>
  error instanceof ApiError && error.code === "CONSENT_REQUIRED";
const refreshConsent = () => {
  void queryClient.invalidateQueries({ queryKey: ["privacy-documents"] });
  void queryClient.invalidateQueries({ queryKey: ["consents"] });
};

const queryClient: QueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
  queryCache: new QueryCache({
    onError: (error) => {
      if (isConsentRequired(error)) refreshConsent();
    },
  }),
  // Todo error de una acción (guardar, borrar, completar…) se avisa una sola vez,
  // como toast. Las pantallas solo marcan campos; no repiten el mensaje.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (isConsentRequired(error)) refreshConsent();
      // La pantalla ya explica el error por su cuenta.
      else if (mutation.meta?.silent) return;
      else if (error instanceof OfflineQueuedError) showToast(error.message, "info");
      else showToast(userMessage(error));
    },
  }),
});
const Stack = createNativeStackNavigator<RootStackParamList>();
// Entre pestañas, la nueva entra por el lado hacia el que se movió la barra:
// a una pestaña de la derecha, desde la derecha; a una de la izquierda, al revés.
const tabScreen = ({ route }: { route: { params?: TabParams } }) =>
  ({
    animation: route.params?.direction === "left" ? "ios_from_left" : "ios_from_right",
  }) as const;

function ActivityFormRoute({ route }: NativeStackScreenProps<RootStackParamList, "ActivityForm">) {
  return (
    <ActivityFormScreen id={route.params.id} draft={route.params.draft} date={route.params.date} />
  );
}

/** Tareas y compromisos son una sola pantalla; cada ruta abre su pestaña. */
function TaskListsRoute() {
  return <ListsScreen initial="tasks" />;
}
function CommitmentListsRoute() {
  return <ListsScreen initial="commitments" />;
}

function EventFormRoute({ route }: NativeStackScreenProps<RootStackParamList, "EventForm">) {
  return <EventFormScreen id={route.params.id} date={route.params.date} />;
}

/**
 * La primera vez (recién registrado) se configura la semana antes de entrar.
 * Sin perfil todavía se espera con la pantalla de arranque; si no carga (sin
 * conexión), se entra a la app como siempre.
 */
function OnboardingGate({ children }: { children: ReactNode }) {
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  // Primero con el agente; el formulario queda de respaldo (sin IA o si lo prefiere).
  const [manual, setManual] = useState<{ initial?: WeekSetup } | null>(null);
  if (profile.isPending) return null;
  if (profile.data && !profile.data.onboardingCompleted)
    return manual ? (
      <OnboardingScreen
        profile={profile.data}
        initial={manual.initial}
        onUseAgent={() => setManual(null)}
      />
    ) : (
      <OnboardingAgentScreen
        profile={profile.data}
        onManual={(initial) => setManual({ initial })}
      />
    );
  return children;
}

/** Al entrar, el perfil toma la zona horaria del teléfono si cambió. */
function TimeZoneSync() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile, retry: false });
  const adopted = useRef(false);
  useEffect(() => {
    if (!profile.data || adopted.current) return;
    adopted.current = true;
    // Sin conexión o con conflicto se reintenta en la próxima sesión.
    adoptDeviceTimeZone(profile.data, queryClient).catch(() => undefined);
  }, [profile.data, queryClient]);
  return null;
}

/** Pantallas con la barra inferior fija. */
const tabRoutes: MainTab[] = ["Home", "Progress", "Profile"];

function Main() {
  const [route, setRoute] = useState<string | undefined>();
  // La barra se oculta en cuanto se pide ir a otra pantalla, no cuando esta ya
  // cargó: así no se ve un instante encima de la pantalla nueva.
  useEffect(
    () =>
      navigationRef.addListener("__unsafe_action__", (event) => {
        const action = event.data.action as {
          type: string;
          payload?: { name?: string; routes?: { name: string }[] };
        };
        if ((action.type === "NAVIGATE" || action.type === "PUSH") && action.payload?.name)
          setRoute(action.payload.name);
        else if (action.type === "RESET" && action.payload?.routes?.length)
          setRoute(action.payload.routes.at(-1)?.name);
      }),
    [],
  );
  const currentQueryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: getCurrentUser,
    retry: false,
  });
  // Con una sesión guardada en el teléfono se entra directo: el servidor la
  // confirma por detrás y, si venció, la app vuelve al inicio de sesión.
  const [savedSession, setSavedSession] = useState<boolean | null>(null);
  useEffect(() => {
    getSessionCookie()
      .then((cookie) => setSavedSession(Boolean(cookie)))
      .catch(() => setSavedSession(false));
  }, []);
  useEffect(() => {
    if (session.isSuccess && !session.data) void clearPrivateCache(currentQueryClient);
  }, [currentQueryClient, session.isSuccess, session.data]);
  const optimistic = savedSession === true && (session.isPending || session.isError);
  if (session.isPending && !optimistic) return <HeroStatus label="Cargando sesión" />;
  // Sin conexión, la app sigue usable con los datos guardados.
  if (session.isError && !optimistic) {
    return (
      <HeroStatus
        message={userMessage(session.error)}
        action={
          <Button mode="contained" onPress={() => void session.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }
  if (!optimistic && !session.data) return <AuthScreen />;
  return (
    <ConsentGate>
      <OnboardingGate>
        <PushRegistrationProvider>
          <NavigationContainer
            // La barra inferior es una sola, fija: solo cambia la pestaña activa.
            onStateChange={() => setRoute(navigationRef.getCurrentRoute()?.name)}
            ref={navigationRef}
            onReady={() => {
              setRoute(navigationRef.getCurrentRoute()?.name);
              hideSplash();
              flushPendingNavigation();
            }}
          >
            <TimeZoneSync />
            <PushPermissionPrompt />
            <StreakCelebration />
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                // Deslizamiento lateral sin fundido: la nueva pantalla entra por la
                // derecha y empuja un poco a la anterior; al volver, al revés.
                animation: "ios_from_right",
              }}
            >
              <Stack.Screen name="Home" options={tabScreen} component={HomeScreen} />
              <Stack.Screen name="Progress" options={tabScreen} component={ProgressScreen} />
              <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
              <Stack.Screen name="Activities" component={TaskListsRoute} />
              <Stack.Screen name="ActivityForm" component={ActivityFormRoute} />
              <Stack.Screen name="Agenda" options={tabScreen} component={AgendaScreen} />
              <Stack.Screen name="Events" component={CommitmentListsRoute} />
              <Stack.Screen name="EventForm" component={EventFormRoute} />
              <Stack.Screen name="Profile" options={tabScreen} component={ProfileScreen} />
              <Stack.Screen name="Availability" component={AvailabilityScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="Alerts" component={AlertsScreen} />
              <Stack.Screen name="Privacy" component={PrivacyScreen} />
              <Stack.Screen name="AiAssistant" component={AssistantChatScreen} />
              <Stack.Screen name="OfflineChanges" component={OfflineChangesScreen} />
              <Stack.Screen name="Reports" component={ReportsScreen} />
              <Stack.Screen name="ReportForm" component={ReportFormScreen} />
            </Stack.Navigator>
            {route && tabRoutes.includes(route as MainTab) && (
              <FloatingNavBar active={route as MainTab} />
            )}
          </NavigationContainer>
        </PushRegistrationProvider>
      </OnboardingGate>
    </ConsentGate>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <OfflineSyncProvider>
          <AppearanceProvider>
            <Main />
          </AppearanceProvider>
        </OfflineSyncProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
