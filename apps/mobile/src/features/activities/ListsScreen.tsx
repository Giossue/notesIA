import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { CommitmentList } from "@/features/calendar/CommitmentList";
import type { RootStackParamList } from "@/navigation/types";
import { commitmentInfo, taskInfo } from "@/shared/concepts";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { Tabs } from "@/shared/Tabs";
import { TaskList } from "./TaskList";

export type ListKind = "tasks" | "commitments";

/**
 * Tareas y compromisos en una sola pantalla, con una pestaña para cada uno. El
 * título, la «i» y el botón + cambian según la pestaña.
 */
export function ListsScreen({ initial = "tasks" }: { initial?: ListKind }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [kind, setKind] = useState<ListKind>(initial);
  const tasks = kind === "tasks";
  return (
    <ScreenLayout
      header={{
        title: tasks ? "Mis tareas" : "Mis compromisos",
        info: tasks ? taskInfo : commitmentInfo,
      }}
      fab={{
        label: tasks ? "Nueva tarea" : "Nuevo compromiso",
        onPress: () =>
          tasks ? navigation.navigate("ActivityForm", {}) : navigation.navigate("EventForm", {}),
      }}
    >
      <Tabs
        value={kind}
        onValueChange={setKind}
        buttons={[
          { value: "tasks", label: "Tareas" },
          { value: "commitments", label: "Compromisos" },
        ]}
      />
      {tasks ? <TaskList /> : <CommitmentList />}
    </ScreenLayout>
  );
}
