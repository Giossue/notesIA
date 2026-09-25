import { NavigationContainer } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
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
import { AuthScreen } from "@/features/auth/AuthScreen";
import { AvailabilityScreen } from "@/features/availability/AvailabilityScreen";
import { EventFormScreen } from "@/features/calendar/EventFormScreen";
import { EventsScreen } from "@/features/calendar/EventsScreen";
import { HomeScreen } from "@/features/home/HomeScreen";
import { NotificationsScreen } from "@/features/notifications/NotificationsScreen";
import { OfflineChangesScreen } from "@/features/offline/OfflineChangesScreen";
import { AcademicPeriodFormScreen } from "@/features/periods/AcademicPeriodFormScreen";
import { AcademicPeriodsScreen } from "@/features/periods/AcademicPeriodsScreen";
import { PlanningScreen } from "@/features/planning/PlanningScreen";
import { PreferencesScreen } from "@/features/preferences/PreferencesScreen";
import { PrivacyScreen } from "@/features/privacy/PrivacyScreen";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { ActivitySeriesFormScreen } from "@/features/series/ActivitySeriesFormScreen";
import { ActivitySeriesScreen } from "@/features/series/ActivitySeriesScreen";
import { SubjectFormScreen } from "@/features/subjects/SubjectFormScreen";
import { SubjectsScreen } from "@/features/subjects/SubjectsScreen";
import { TimeTrackingScreen } from "@/features/time/TimeTrackingScreen";
import { ToolsScreen } from "@/features/tools/ToolsScreen";
import type { RootStackParamList } from "@/navigation/types";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const Stack = createNativeStackNavigator<RootStackParamList>();
const tabScreen = { animation: "none" } as const;

function SubjectFormRoute({ route }: NativeStackScreenProps<RootStackParamList, "SubjectForm">) {
  return <SubjectFormScreen id={route.params.id} />;
}

function ActivityFormRoute({ route }: NativeStackScreenProps<RootStackParamList, "ActivityForm">) {
  return <ActivityFormScreen id={route.params.id} draft={route.params.draft} />;
}

function EventFormRoute({ route }: NativeStackScreenProps<RootStackParamList, "EventForm">) {
  return <EventFormScreen id={route.params.id} />;
}

function AcademicPeriodFormRoute({
  route,
}: NativeStackScreenProps<RootStackParamList, "AcademicPeriodForm">) {
  return <AcademicPeriodFormScreen id={route.params.id} />;
}

function Main() {
  const currentQueryClient = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: getCurrentUser, retry: false });
  useEffect(() => {
    if (session.isSuccess && !session.data) void clearPrivateCache(currentQueryClient);
  }, [currentQueryClient, session.isSuccess, session.data]);
  if (session.isPending) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator accessibilityLabel="Cargando sesión" />
      </SafeAreaView>
    );
  }
  if (session.isError) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Text accessibilityRole="alert">{session.error.message}</Text>
        <Button onPress={() => void session.refetch()}>Reintentar</Button>
      </SafeAreaView>
    );
  }
  if (!session.data) return <AuthScreen />;
  return (
    <PushRegistrationProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" options={tabScreen} component={HomeScreen} />
          <Stack.Screen name="Subjects" component={SubjectsScreen} />
          <Stack.Screen name="SubjectForm" component={SubjectFormRoute} />
          <Stack.Screen name="Activities" options={tabScreen} component={ActivityListScreen} />
          <Stack.Screen name="ActivityForm" component={ActivityFormRoute} />
          <Stack.Screen name="Agenda" options={tabScreen} component={AgendaScreen} />
          <Stack.Screen name="Events" options={tabScreen} component={EventsScreen} />
          <Stack.Screen name="EventForm" component={EventFormRoute} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Tools" component={ToolsScreen} />
          <Stack.Screen name="AcademicPeriods" component={AcademicPeriodsScreen} />
          <Stack.Screen name="AcademicPeriodForm" component={AcademicPeriodFormRoute} />
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
