import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { type AuthSession, authApi } from "@/lib/auth-api";

const links = [
  { to: "/" as const, label: "Salud" },
  { to: "/users" as const, label: "Usuarios" },
  { to: "/roles" as const, label: "Roles" },
  { to: "/privacy" as const, label: "Privacidad" },
  { to: "/ai" as const, label: "IA" },
  { to: "/audit" as const, label: "Auditoría" },
];

export function AdminShell({ session }: { session: AuthSession }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = useMutation({
    mutationFn: authApi.signOut,
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/login" });
    },
  });
  return (
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>NotesIA Admin</strong>
          <div>{session.user.email}</div>
        </div>
        <Button variant="outline" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
          Cerrar sesión
        </Button>
      </header>
      <nav aria-label="Administración" className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Button key={link.to} variant="ghost" asChild>
            <Link to={link.to}>{link.label}</Link>
          </Button>
        ))}
      </nav>
      <Separator />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
