import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type AuthSession, authApi } from "@/lib/auth-api";
import { NavMain } from "./shell/nav-main";
import { NavUser } from "./shell/nav-user";
import { ThemeSwitcher } from "./shell/theme-switcher";

function sidebarDefaultOpen() {
  return !document.cookie.split("; ").includes("sidebar_state=false");
}

/**
 * Marco del panel. Se muestra desde el primer instante: mientras la sesión o
 * el acceso se comprueban, `children` ocupa el contenido (carga o error) y el
 * pie del menú lateral espera a la cuenta.
 */
export function AdminShell({ session, children }: { session?: AuthSession; children?: ReactNode }) {
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
    <SidebarProvider
      defaultOpen={sidebarDefaultOpen()}
      style={{ "--sidebar-width": "calc(var(--spacing) * 68)" } as CSSProperties}
    >
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* Marca sin enlace: evita un segundo enlace cuyo nombre contenga "IA". */}
              <SidebarMenuButton asChild className="hover:bg-transparent active:bg-transparent">
                <div>
                  <NotebookPen />
                  <span className="font-semibold text-base">NotesIA Admin</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavMain />
        </SidebarContent>
        <SidebarFooter>
          {session ? (
            <NavUser
              user={session.user}
              signOut={() => signOut.mutate()}
              signingOut={signOut.isPending}
            />
          ) : (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            </SidebarMenu>
          )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-x-clip peer-data-[variant=inset]:border">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b">
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger className="-ml-1" />
                </TooltipTrigger>
                <TooltipContent>Mostrar u ocultar el menú</TooltipContent>
              </Tooltip>
            </div>
            <ThemeSwitcher />
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">
          {children ?? <Outlet />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
