import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { listSubjects } from "@/core/api/subjects";
import { layout, sharedStyles } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";

export function SubjectsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const [archived, setArchived] = useState(false);
  const offline = useNetInfo().isConnected === false;
  const subjects = useInfiniteQuery({
    queryKey: ["subjects", archived],
    queryFn: ({ pageParam }) => listSubjects(archived, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const items = subjects.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <ScreenLayout
      header={{ title: "Materias" }}
      fab={{ label: "Nueva materia", onPress: () => navigation.navigate("SubjectForm", {}) }}
    >
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Crea y organiza tus materias.
      </Text>
      <Tabs
        value={archived ? "archived" : "active"}
        onValueChange={(value) => setArchived(value === "archived")}
        buttons={[
          { value: "active", label: "Activas" },
          { value: "archived", label: "Archivadas" },
        ]}
      />
      {offline && (
        <Text style={{ color: theme.colors.error }}>
          Sin conexión. Se muestran los datos guardados en esta sesión.
        </Text>
      )}
      {subjects.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando materias" />
      )}
      {subjects.isError && (
        <View style={styles.message}>
          <Text accessibilityRole="alert">{userMessage(subjects.error)}</Text>
          <Button onPress={() => void subjects.refetch()}>Reintentar</Button>
        </View>
      )}
      {!subjects.isPending && !subjects.isError && items.length === 0 && (
        <EmptyState
          message={
            archived ? "No tienes materias archivadas." : "Aún no tienes materias. Crea la primera."
          }
        />
      )}
      {items.map((item) => (
        <Card
          key={item.id}
          mode="contained"
          onPress={() => navigation.navigate("SubjectForm", { id: item.id })}
          accessibilityLabel={`Abrir materia ${item.name}`}
        >
          <Card.Content style={styles.row}>
            <View style={[styles.dot, { backgroundColor: theme.colors[item.colorToken] }]} />
            <View style={styles.itemText}>
              <Text variant="titleMedium">{item.name}</Text>
            </View>
          </Card.Content>
        </Card>
      ))}
      {subjects.hasNextPage && (
        <Button
          mode="outlined"
          loading={subjects.isFetchingNextPage}
          disabled={offline || subjects.isFetchingNextPage}
          onPress={() => void subjects.fetchNextPage()}
          contentStyle={sharedStyles.actionContent}
        >
          Cargar más
        </Button>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  message: { gap: layout.itemGap },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 16 },
  dot: { width: 20, height: 20, borderRadius: 10 },
  itemText: { flex: 1, gap: 4 },
});
