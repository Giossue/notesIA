import type { QueryClient } from "@tanstack/react-query";

const isPrivateQuery = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "session";

export async function clearPrivateCache(queryClient: QueryClient) {
  await queryClient.cancelQueries({ predicate: isPrivateQuery });
  queryClient.removeQueries({ predicate: isPrivateQuery });
  queryClient.getMutationCache().clear();
}
