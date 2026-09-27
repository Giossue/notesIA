import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native-paper";
import { getActivity } from "@/core/api/activities";

export function ActivityTitle({ id, prefix = "" }: { id: string; prefix?: string }) {
  const activity = useQuery({
    queryKey: ["activity", id],
    queryFn: () => getActivity(id),
    retry: false,
  });
  if (activity.isPending) return <Text variant="titleSmall">{prefix}Cargando tarea…</Text>;
  if (activity.isError) return <Text variant="titleSmall">{prefix}Tarea no disponible</Text>;
  return (
    <Text variant="titleSmall">
      {prefix}
      {activity.data.title}
    </Text>
  );
}
