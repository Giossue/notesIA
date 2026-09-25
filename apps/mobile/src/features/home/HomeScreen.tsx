import { todayInTimeZone, utcToLocalDateTime } from "@notesia/domain";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Icon,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { listActivities } from "@/core/api/activities";
import { listCalendarEvents } from "@/core/api/calendar-events";
import { getProfile } from "@/core/api/profile";
import { listSubjects } from "@/core/api/subjects";
import { layout } from "@/core/theme/layout";
import { iconTint } from "@/core/theme/theme";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { HomeHeader } from "./HomeHeader";

type TodayItem = {
  id: string;
  title: string;
  instant: string;
  time: string;
  label: string;
  detail: string;
  route: "EventForm" | "ActivityForm";
};

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const iconColor = iconTint[theme.dark ? "dark" : "light"];
  const offline = useNetInfo().isConnected === false;
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: false,
  });
  const timeZone = profile.data?.timeZone;
  const day = timeZone ? todayInTimeZone(new Date().toISOString(), timeZone) : null;
  const events = useInfiniteQuery({
    queryKey: ["agenda-events", day],
    queryFn: ({ pageParam }) => listCalendarEvents({ on: day ?? undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!day,
    retry: false,
  });
  const deadlines = useInfiniteQuery({
    queryKey: ["agenda", day],
    queryFn: ({ pageParam }) => listActivities({ dueOn: day ?? undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!day,
    retry: false,
  });
  const subjects = useInfiniteQuery({
    queryKey: ["subjects", false],
    queryFn: ({ pageParam }) => listSubjects(false, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });

  const eventItems = events.data?.pages.flatMap((page) => page.items) ?? [];
  const deadlineItems = deadlines.data?.pages.flatMap((page) => page.items) ?? [];
  const subjectItems = subjects.data?.pages.flatMap((page) => page.items) ?? [];
  const todayItems: TodayItem[] = timeZone
    ? [
        ...eventItems.map((item) => ({
          id: item.id,
          title: item.title,
          instant: item.startsAt,
          time: formatTime(item.startsAt, timeZone),
          label: "EVENTO",
          detail: `${formatTime(item.startsAt, timeZone)}–${formatTime(item.endsAt, timeZone)}`,
          route: "EventForm" as const,
        })),
        ...deadlineItems.flatMap((item) => {
          const deadlineAt = item.deadlineAt;
          if (!deadlineAt || item.status === "completed" || item.status === "cancelled") return [];
          return [
            {
              id: item.id,
              title: item.title,
              instant: deadlineAt,
              time: formatTime(deadlineAt, timeZone),
              label: "LÍMITE",
              detail: `Entrega a las ${formatTime(deadlineAt, timeZone)}`,
              route: "ActivityForm" as const,
            },
          ];
        }),
      ].sort((a, b) => a.instant.localeCompare(b.instant))
    : [];

  const agendaReady =
    !!day && !events.isPending && !deadlines.isPending && !events.isError && !deadlines.isError;
  const hour = timeZone
    ? Number(utcToLocalDateTime(new Date().toISOString(), timeZone).slice(11, 13))
    : new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <ScreenLayout tab="Home">
      <HomeHeader
        name={profile.data?.displayName || "Tu espacio"}
        greeting={greeting}
        onOpenProfile={() => navigation.navigate("Profile")}
        onOpenNotifications={() => navigation.navigate("Notifications")}
      />
      {profile.isPending && <ActivityIndicator accessibilityLabel="Cargando perfil" />}
      {profile.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{profile.error.message}</Text>
          <Button onPress={() => void profile.refetch()}>Reintentar perfil</Button>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionHeadingText}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Hoy en tu agenda
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Eventos fijos y fechas límite
            </Text>
          </View>
          <Button compact onPress={() => navigation.navigate("Agenda")}>
            Ver todo
          </Button>
        </View>
        {offline && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            Sin conexión. Se muestran los datos guardados.
          </Text>
        )}
        {day && (events.isPending || deadlines.isPending) && !offline && (
          <ActivityIndicator accessibilityLabel="Cargando agenda de hoy" />
        )}
        {events.isError && (
          <ErrorRetry message={events.error.message} onRetry={() => void events.refetch()} />
        )}
        {deadlines.isError && (
          <ErrorRetry message={deadlines.error.message} onRetry={() => void deadlines.refetch()} />
        )}
        {agendaReady && todayItems.length === 0 && (
          <EmptyState
            icon="calendar-check-outline"
            message="No tienes actividades programadas para hoy. Aprovecha para avanzar a tu ritmo."
          />
        )}
        {todayItems.slice(0, 3).map((item) => (
          <TouchableRipple
            borderless
            key={`${item.route}-${item.id}`}
            onPress={() => navigation.navigate(item.route, { id: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${item.title}`}
            style={[
              styles.todayCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outlineVariant,
                borderWidth: theme.dark ? 1 : 0,
                elevation: theme.dark ? 0 : 1,
              },
            ]}
          >
            <View style={styles.todayContent}>
              <View
                style={[
                  styles.timeTile,
                  {
                    backgroundColor:
                      item.route === "EventForm"
                        ? theme.colors.primaryContainer
                        : theme.colors.tertiaryContainer,
                  },
                ]}
              >
                <Text
                  variant="labelSmall"
                  style={[
                    styles.timeLabel,
                    {
                      color:
                        item.route === "EventForm"
                          ? theme.colors.onPrimaryContainer
                          : theme.colors.onTertiaryContainer,
                    },
                  ]}
                >
                  {item.label}
                </Text>
                <Text
                  variant="titleSmall"
                  style={{
                    color:
                      item.route === "EventForm"
                        ? theme.colors.onPrimaryContainer
                        : theme.colors.onTertiaryContainer,
                    fontWeight: "600",
                  }}
                >
                  {item.time}
                </Text>
              </View>
              <View style={styles.todayText}>
                <Text variant="titleSmall" numberOfLines={2} style={styles.bold}>
                  {item.title}
                </Text>
                <Text
                  variant="bodySmall"
                  numberOfLines={1}
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {item.detail}
                </Text>
              </View>
              <Icon source="chevron-right" size={20} color={iconColor} />
            </View>
          </TouchableRipple>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionHeadingText}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Tus materias
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Organiza tu plan de estudio
            </Text>
          </View>
          <Button compact onPress={() => navigation.navigate("Subjects")}>
            Ver todas
          </Button>
        </View>
        {subjects.isPending && !offline && (
          <ActivityIndicator accessibilityLabel="Cargando materias" />
        )}
        {subjects.isError && (
          <ErrorRetry message={subjects.error.message} onRetry={() => void subjects.refetch()} />
        )}
        {!subjects.isPending && !subjects.isError && subjectItems.length === 0 && (
          <EmptyState
            icon="book-open-page-variant-outline"
            message="Puedes crear la primera materia y empezar a organizar tu estudio."
          />
        )}
        {subjectItems.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subjectRow}
          >
            {subjectItems.slice(0, 4).map((subject) => (
              <TouchableRipple
                borderless
                key={subject.id}
                onPress={() => navigation.navigate("SubjectForm", { id: subject.id })}
                accessibilityRole="button"
                accessibilityLabel={`Abrir materia ${subject.name}`}
                style={[
                  styles.subjectCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.outlineVariant,
                    borderWidth: theme.dark ? 1 : 0,
                    elevation: theme.dark ? 0 : 1,
                  },
                ]}
              >
                <View style={styles.subjectContent}>
                  <View
                    style={[
                      styles.subjectIcon,
                      {
                        backgroundColor: theme.colors[`${subject.colorToken}Container`],
                      },
                    ]}
                  >
                    <Icon source="book-open-outline" color={iconColor} size={22} />
                  </View>
                  <View style={styles.subjectCopy}>
                    <Text variant="titleMedium" numberOfLines={2} style={styles.bold}>
                      {subject.name}
                    </Text>
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {subject.code ?? "Materia"}
                    </Text>
                  </View>
                </View>
              </TouchableRipple>
            ))}
          </ScrollView>
        )}
      </View>
    </ScreenLayout>
  );
}

function formatTime(instant: string, timeZone: string) {
  return utcToLocalDateTime(instant, timeZone).slice(11, 16);
}

function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.message}>
      <Text accessibilityRole="alert">{message}</Text>
      <Button onPress={onRetry}>Reintentar</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  message: { gap: layout.itemGap },
  bold: { fontWeight: "600" },
  section: { gap: 12 },
  sectionTitle: { fontWeight: "600" },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHeadingText: { flex: 1, gap: 2 },
  todayCard: {
    borderRadius: layout.cardRadius,
    overflow: "hidden",
    minHeight: 84,
  },
  todayContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  timeTile: {
    width: 62,
    height: 60,
    borderRadius: layout.smallRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  timeLabel: { fontWeight: "600", letterSpacing: 0.5 },
  todayText: { flex: 1, gap: 2 },
  subjectRow: { gap: 12, paddingBottom: 4 },
  subjectCard: {
    width: 190,
    height: 142,
    borderRadius: layout.cardRadius,
    overflow: "hidden",
  },
  subjectContent: { flex: 1, justifyContent: "space-between", padding: 16 },
  subjectIcon: {
    width: 38,
    height: 38,
    borderRadius: layout.smallRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  subjectCopy: { gap: 2 },
});
