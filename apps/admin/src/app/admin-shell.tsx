import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";
import type { CSSProperties } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type AuthSession, authApi } from "@/lib/auth-api";
import { navItems } from "./shell/nav-items";
import { NavMain } from "./shell/nav-main";
import { NavUser } from "./shell/nav-user";
import { ThemeSwitcher } from "./shell/theme-switcher";

function sidebarDefaultOpen() {
  return !document.cookie.split("; ").includes("sidebar_state=false");
}

export function AdminShell({ session }: { session: AuthSession }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = navItems.find((item) => item.to === pathname);
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
          <NavUser
            user={session.user}
            signOut={() => signOut.mutate()}
            signingOut={signOut.isPending}
          />
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
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">Administración</BreadcrumbItem>
                  {current ? (
                    <>
                      <BreadcrumbSeparator className="hidden md:block" />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{current.label}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  ) : null}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <ThemeSwitcher />
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">
          {signOut.error ? <div className="mb-4"></div> : null}
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
