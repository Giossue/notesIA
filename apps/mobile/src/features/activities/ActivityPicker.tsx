import { useNetInfo } from "@react-native-community/netinfo";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Text } from "react-native-paper";
import { listActivities } from "@/core/api/activities";
import { userMessage } from "@/shared/errors";
import { SelectField } from "@/shared/fields";
import { Menu } from "@/shared/paper";

export function ActivityPicker({
  value,
  onChange,
  label = "Tarea",
}: {
  value: string;
  onChange(value: string): void;
  label?: string;
}) {
  const offline = useNetInfo().isConnected === false;
  const activities = useInfiniteQuery({
    queryKey: ["activities", "picker"],
    queryFn: ({ pageParam }) => listActivities({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const items =
    activities.data?.pages
      .flatMap((page) => page.items)
      .filter((item) => item.status !== "completed" && item.status !== "cancelled") ?? [];
  return (
    <>
      <SelectField
        label={label}
        value={value}
        options={items.map((item) => ({ value: item.id, label: item.title }))}
        onChange={onChange}
        footer={
          activities.hasNextPage && (
            <Menu.Item
              title="Cargar más"
              disabled={offline}
              onPress={() => void activities.fetchNextPage()}
            />
          )
        }
      />
      {activities.isError && <Text accessibilityRole="alert">{userMessage(activities.error)}</Text>}
    </>
  );
}
