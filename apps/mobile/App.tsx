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
import { useEffect, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApiError, OfflineQueuedError } from "@/core/api/client";
import { getProfile } from "@/core/api/profile";
import { getCurrentUser } from "@/core/auth/auth-client";
import { clearPrivateCache } from "@/core/auth/query-cache";
import { OfflineSyncProvider } from "@/core/offline/OfflineSyncProvider";
import { PushRegistrationProvider } from "@/core/push/PushRegistrationProvider";
import { AppearanceProvider } from "@/core/theme/AppearanceProvider";
import { AccountScreen } from "@/features/account/AccountScreen";
import { ActivityFormScreen } from "@/features/activities/ActivityFormScreen";
import { ActivityListScreen } from "@/features/activities/ActivityListScreen";
import { AgendaScreen } from "@/features/activities/AgendaScreen";
import { AiAssistantScreen } from "@/features/ai/AiAssistantScreen";
import { HeroStatus } from "@/features/auth/AuthHero";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { AvailabilityScreen } from "@/features/availability/AvailabilityScreen";
import { EventFormScreen } from "@/features/calendar/EventFormScreen";
import { EventsScreen } from "@/features/calendar/EventsScreen";
import { HomeScreen } from "@/features/home/HomeScreen";
import { NotificationsScreen } from "@/features/notifications/NotificationsScreen";
import { OfflineChangesScreen } from "@/features/offline/OfflineChangesScreen";
import { PlanningScreen } from "@/features/planning/PlanningScreen";
import { PreferencesScreen } from "@/features/preferences/PreferencesScreen";
import { ConsentGate } from "@/features/privacy/ConsentGate";
import { PrivacyScreen } from "@/features/privacy/PrivacyScreen";
import { ProfileEditScreen } from "@/features/profile/ProfileEditScreen";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { ProgressScreen } from "@/features/progress/ProgressScreen";
import { ActivitySeriesFormScreen } from "@/features/series/ActivitySeriesFormScreen";
import { ActivitySeriesScreen } from "@/features/series/ActivitySeriesScreen";
import { TimeTrackingScreen } from "@/features/time/TimeTrackingScreen";
import { ToolsScreen } from "@/features/tools/ToolsScreen";
import type { RootStackParamList, TabParams } from "@/navigation/types";
import { userMessage } from "@/shared/errors";
import { Button } from "@/shared/paper";
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
    onError: (error) => {
      if (isConsentRequired(error)) refreshConsent();
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

function EventFormRoute({ route }: NativeStackScreenProps<RootStackParamList, "EventForm">) {
  return <EventFormScreen id={route.params.id} date={route.params.date} />;
}

/** Perfiles sin zona elegida adoptan la del teléfono al entrar. */
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

function Main() {
  const currentQueryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: getCurrentUser,
    retry: false,
  });
  useEffect(() => {
    if (session.isSuccess && !session.data) void clearPrivateCache(currentQueryClient);
  }, [currentQueryClient, session.isSuccess, session.data]);
  if (session.isPending) return <HeroStatus label="Cargando sesión" />;
  if (session.isError) {
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
  if (!session.data) return <AuthScreen />;
  return (
    <ConsentGate>
      <PushRegistrationProvider>
        <NavigationContainer>
          <TimeZoneSync />
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
            <Stack.Screen name="Activities" component={ActivityListScreen} />
            <Stack.Screen name="ActivityForm" component={ActivityFormRoute} />
            <Stack.Screen name="Agenda" options={tabScreen} component={AgendaScreen} />
            <Stack.Screen name="Events" component={EventsScreen} />
            <Stack.Screen name="EventForm" component={EventFormRoute} />
            <Stack.Screen name="Profile" options={tabScreen} component={ProfileScreen} />
            <Stack.Screen name="Tools" component={ToolsScreen} />
            <Stack.Screen name="Availability" component={AvailabilityScreen} />
            <Stack.Screen name="Planning" component={PlanningScreen} />
            <Stack.Screen name="TimeTracking" component={TimeTrackingScreen} />
            <Stack.Screen name="ActivitySeries" component={ActivitySeriesScreen} />
            <Stack.Screen name="ActivitySeriesForm" component={ActivitySeriesFormScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Preferences" component={PreferencesScreen} />
            <Stack.Screen name="Privacy" component={PrivacyScreen} />
            <Stack.Screen name="AiAssistant" component={AiAssistantScreen} />
            <Stack.Screen name="Account" component={AccountScreen} />
            <Stack.Screen name="OfflineChanges" component={OfflineChangesScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </PushRegistrationProvider>
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
