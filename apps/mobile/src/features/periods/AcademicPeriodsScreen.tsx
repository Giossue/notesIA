import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { listAcademicPeriods } from "@/core/api/academic-periods";
import { layout } from "@/core/theme/layout";
import type { RootStackParamList } from "@/navigation/types";
import { EmptyState } from "@/shared/EmptyState";
import { userMessage } from "@/shared/errors";
import { Button, Card } from "@/shared/paper";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";

export function AcademicPeriodsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const offline = useNetInfo().isConnected === false;
  const [archived, setArchived] = useState(false);
  const periods = useInfiniteQuery({
    queryKey: ["academic-periods", archived],
    queryFn: ({ pageParam }) => listAcademicPeriods(archived, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const items = periods.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <ScreenLayout
      header={{ title: "Periodos académicos" }}
      fab={{ label: "Nuevo periodo", onPress: () => navigation.navigate("AcademicPeriodForm", {}) }}
    >
      <Tabs
        value={archived ? "archived" : "active"}
        onValueChange={(value) => setArchived(value === "archived")}
        buttons={[
          { value: "active", label: "Activos" },
          { value: "archived", label: "Archivados" },
        ]}
      />
      {offline && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          Sin conexión. Conéctate para actualizar los periodos.
        </Text>
      )}
      {periods.isPending && !offline && (
        <ActivityIndicator accessibilityLabel="Cargando periodos académicos" />
      )}
      {periods.isError && (
        <View style={styles.group}>
          <Text accessibilityRole="alert">{userMessage(periods.error)}</Text>
          <Button onPress={() => void periods.refetch()}>Reintentar</Button>
        </View>
      )}
      {!periods.isPending && !periods.isError && items.length === 0 && (
        <EmptyState
          message={
            archived ? "No hay periodos archivados." : "Aún no has creado un periodo académico."
          }
        />
      )}
      {items.map((period) => (
        <Card
          key={period.id}
          mode="contained"
          onPress={() => navigation.navigate("AcademicPeriodForm", { id: period.id })}
          accessibilityLabel={`Abrir periodo ${period.name}`}
        >
          <Card.Content style={styles.group}>
            <Text variant="titleMedium">{period.name}</Text>
            <Text variant="bodyMedium">
              {period.startsOn} a {period.endsOn}
            </Text>
          </Card.Content>
        </Card>
      ))}
      {periods.hasNextPage && (
        <Button
          mode="outlined"
          loading={periods.isFetchingNextPage}
          disabled={offline || periods.isFetchingNextPage}
          onPress={() => void periods.fetchNextPage()}
        >
          Cargar más
        </Button>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({ group: { gap: layout.itemGap } });
