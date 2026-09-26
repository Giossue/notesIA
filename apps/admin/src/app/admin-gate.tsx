import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { AdminShell } from "@/app/admin-shell";
import { PageError, PageLoading } from "@/components/async-state";
import { AuthLayout } from "@/features/auth/auth-layout";
import { FreshSessionRequired } from "@/features/auth/fresh-session-required";
import { TwoFactorEnrollment } from "@/features/auth/two-factor-enrollment";
import { ApiError } from "@/lib/api";
import { sessionQuery, systemHealthQuery } from "@/lib/query";

export function AdminGate() {
  const session = useQuery(sessionQuery);
  const access = useQuery({ ...systemHealthQuery, enabled: Boolean(session.data) });
  if (session.isPending)
    return (
      <AdminShell>
        <PageLoading />
      </AdminShell>
    );
  if (session.isError)
    return (
      <AdminShell>
        <PageError error={session.error} retry={() => session.refetch()} />
      </AdminShell>
    );
  if (!session.data) return <Navigate to="/login" />;
  if (access.isPending)
    return (
      <AdminShell session={session.data}>
        <PageLoading />
      </AdminShell>
    );
  if (access.error instanceof ApiError && access.error.code === "MFA_REQUIRED")
    return (
      <AuthLayout>
        {session.data.user.twoFactorEnabled ? <FreshSessionRequired /> : <TwoFactorEnrollment />}
      </AuthLayout>
    );
  if (access.error instanceof ApiError && access.error.status === 403)
    return (
      <AuthLayout>
        <div className="mx-auto flex w-full flex-col justify-center sm:w-[350px]">
          <PageError error={access.error} />
        </div>
      </AuthLayout>
    );
  if (access.isError)
    return (
      <AdminShell session={session.data}>
        <PageError error={access.error} retry={() => access.refetch()} />
      </AdminShell>
    );
  return <AdminShell session={session.data} />;
}
