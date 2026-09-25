import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { AdminShell } from "@/app/admin-shell";
import { PageError, PageLoading } from "@/components/async-state";
import { FreshSessionRequired } from "@/features/auth/fresh-session-required";
import { TwoFactorEnrollment } from "@/features/auth/two-factor-enrollment";
import { ApiError } from "@/lib/api";
import { sessionQuery, systemHealthQuery } from "@/lib/query";

export function AdminGate() {
  const session = useQuery(sessionQuery);
  const access = useQuery({ ...systemHealthQuery, enabled: Boolean(session.data) });
  if (session.isPending) return <PageLoading />;
  if (session.isError) return <PageError error={session.error} retry={() => session.refetch()} />;
  if (!session.data) return <Navigate to="/login" />;
  if (access.isPending) return <PageLoading />;
  if (access.error instanceof ApiError && access.error.code === "MFA_REQUIRED")
    return (
      <main className="mx-auto max-w-xl p-4">
        {session.data.user.twoFactorEnabled ? <FreshSessionRequired /> : <TwoFactorEnrollment />}
      </main>
    );
  if (access.error instanceof ApiError && access.error.status === 403)
    return (
      <main className="mx-auto max-w-xl p-4">
        <PageError error={access.error} />
      </main>
    );
  if (access.isError) return <PageError error={access.error} retry={() => access.refetch()} />;
  return <AdminShell session={session.data} />;
}
