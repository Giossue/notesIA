import { useNetInfo } from "@react-native-community/netinfo";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Menu, Text } from "react-native-paper";
import { listActivities } from "@/core/api/activities";

export function ActivityPicker({
  value,
  onChange,
  label = "Actividad",
}: {
  value: string;
  onChange(value: string): void;
  label?: string;
}) {
  const offline = useNetInfo().isConnected === false;
  const [open, setOpen] = useState(false);
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
      <Menu
        visible={open}
        onDismiss={() => setOpen(false)}
        anchor={
          <Button mode="outlined" onPress={() => setOpen(true)}>
            {label}: {items.find((item) => item.id === value)?.title ?? "Seleccionar"}
          </Button>
        }
      >
        {items.map((item) => (
          <Menu.Item
            key={item.id}
            title={item.title}
            onPress={() => {
              onChange(item.id);
              setOpen(false);
            }}
          />
        ))}
        {activities.hasNextPage && (
          <Menu.Item
            title="Cargar más"
            disabled={offline}
            onPress={() => void activities.fetchNextPage()}
          />
        )}
      </Menu>
      {activities.isError && <Text accessibilityRole="alert">{activities.error.message}</Text>}
    </>
  );
}
