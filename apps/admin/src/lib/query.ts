import { queryOptions } from "@tanstack/react-query";
import { adminApi } from "./admin-api";
import { authApi } from "./auth-api";

export const sessionQuery = queryOptions({
  queryKey: ["auth", "session"],
  queryFn: authApi.session,
  staleTime: 30_000,
  retry: false,
});

export const systemHealthQuery = queryOptions({
  queryKey: ["admin", "system-health"],
  queryFn: adminApi.systemHealth,
  staleTime: 10_000,
  retry: false,
});

export const usersQueryKey = ["admin", "users"] as const;
export const rolesQueryKey = ["admin", "roles"] as const;
export const documentsQueryKey = ["admin", "privacy-documents"] as const;
export const auditQueryKey = ["admin", "audit"] as const;
export const aiProvidersQuery = queryOptions({
  queryKey: ["admin", "ai", "providers"],
  queryFn: adminApi.aiProviders,
  staleTime: 10_000,
  retry: false,
});
export const aiRoutesQuery = queryOptions({
  queryKey: ["admin", "ai", "routes"],
  queryFn: adminApi.aiRoutes,
  staleTime: 10_000,
  retry: false,
});
