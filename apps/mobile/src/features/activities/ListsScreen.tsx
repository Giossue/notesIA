import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/types";
import { taskInfo } from "@/shared/concepts";
import { ScreenLayout } from "@/shared/ScreenLayout";
import { TaskList } from "./TaskList";

export function ListsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <ScreenLayout
      header={{ title: "Mis tareas", info: taskInfo }}
      fab={{
        label: "Nueva tarea",
        onPress: () => navigation.navigate("ActivityForm", {}),
      }}
    >
      <TaskList />
    </ScreenLayout>
  );
}
