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
import { AppearanceProvider } from "@/core/theme/AppearanceProvider";
import { ActivityFormScreen } from "@/features/activities/ActivityFormScreen";
import { ActivityListScreen } from "@/features/activities/ActivityListScreen";
import { AgendaScreen } from "@/features/activities/AgendaScreen";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { EventFormScreen } from "@/features/calendar/EventFormScreen";
import { EventsScreen } from "@/features/calendar/EventsScreen";
import { HomeScreen } from "@/features/home/HomeScreen";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { SubjectFormScreen } from "@/features/subjects/SubjectFormScreen";
import { SubjectsScreen } from "@/features/subjects/SubjectsScreen";
import type { RootStackParamList } from "@/navigation/types";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const Stack = createNativeStackNavigator<RootStackParamList>();
const tabScreen = { animation: "none" } as const;

function SubjectFormRoute({ route }: NativeStackScreenProps<RootStackParamList, "SubjectForm">) {
  return <SubjectFormScreen id={route.params.id} />;
}

function ActivityFormRoute({ route }: NativeStackScreenProps<RootStackParamList, "ActivityForm">) {
  return <ActivityFormScreen id={route.params.id} />;
}

function EventFormRoute({ route }: NativeStackScreenProps<RootStackParamList, "EventForm">) {
  return <EventFormScreen id={route.params.id} />;
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppearanceProvider>
          <Main />
        </AppearanceProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
