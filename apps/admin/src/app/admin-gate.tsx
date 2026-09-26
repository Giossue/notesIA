import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminShell } from "@/app/admin-shell";
import { PageError, PageLoading } from "@/components/async-state";
import { AuthLayout } from "@/features/auth/auth-layout";
import { FreshSessionRequired } from "@/features/auth/fresh-session-required";
import { TwoFactorEnrollment } from "@/features/auth/two-factor-enrollment";
import { ApiError } from "@/lib/api";
import { sessionQuery, systemHealthQuery } from "@/lib/query";

function GateFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center p-4 md:p-6">
      {children}
    </main>
  );
}

function GateLoading() {
  return (
    <GateFrame>
      <PageLoading />
    </GateFrame>
  );
}

export function AdminGate() {
  const session = useQuery(sessionQuery);
  const access = useQuery({ ...systemHealthQuery, enabled: Boolean(session.data) });
  if (session.isPending) return <GateLoading />;
  if (session.isError)
    return (
      <GateFrame>
        <PageError error={session.error} retry={() => session.refetch()} />
      </GateFrame>
    );
  if (!session.data) return <Navigate to="/login" />;
  if (access.isPending) return <GateLoading />;
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
      <GateFrame>
        <PageError error={access.error} retry={() => access.refetch()} />
      </GateFrame>
    );
  return <AdminShell session={session.data} />;
}
