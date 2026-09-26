import { useQuery } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { AdminGate } from "@/app/admin-gate";
import { AiPage } from "@/features/ai/ai-page";
import { AuditPage } from "@/features/audit/audit-page";
import { LoginPage } from "@/features/auth/login-page";
import { ResetPasswordPage } from "@/features/auth/reset-password-page";
import { TwoFactorChallengePage } from "@/features/auth/two-factor-challenge-page";
import { PrivacyPage } from "@/features/privacy/privacy-page";
import { ReportsPage } from "@/features/reports/reports-page";
import { RolesPage } from "@/features/roles/roles-page";
import { SystemHealthPage } from "@/features/system-health/system-health-page";
import { UsersPage } from "@/features/users/users-page";
import { meQuery } from "@/lib/query";

/** Inicio según el rol: soporte va directo a Reportes. */
function HomePage() {
  const me = useQuery(meQuery);
  if (me.data?.role === "support") return <Navigate to="/reports" />;
  return <SystemHealthPage />;
}

const rootRoute = createRootRoute({ component: Outlet });
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
const twoFactorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/two-factor",
  component: TwoFactorChallengePage,
});
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPasswordPage,
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "admin",
  component: AdminGate,
});
const healthRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/",
  component: HomePage,
});
const usersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/users",
  component: UsersPage,
});
const rolesRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/roles",
  component: RolesPage,
});
const privacyRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/privacy",
  component: PrivacyPage,
});
const aiRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/ai",
  component: AiPage,
});
const reportsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/reports",
  component: ReportsPage,
});
const auditRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/audit",
  component: AuditPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  twoFactorRoute,
  resetPasswordRoute,
  adminRoute.addChildren([
    healthRoute,
    usersRoute,
    rolesRoute,
    privacyRoute,
    aiRoute,
    auditRoute,
    reportsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
