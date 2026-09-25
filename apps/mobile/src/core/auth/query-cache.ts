import type { QueryClient } from "@tanstack/react-query";

const isPrivateQuery = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "session";

export async function clearPrivateCache(
  queryClient: QueryClient,
  clearLocal: () => Promise<void> = async () => {
    const { clearLocalPrivateData } = await import("@/core/offline/database");
    await clearLocalPrivateData();
  },
) {
  await queryClient.cancelQueries({ predicate: isPrivateQuery });
  queryClient.removeQueries({ predicate: isPrivateQuery });
  queryClient.getMutationCache().clear();
  await clearLocal();
}
