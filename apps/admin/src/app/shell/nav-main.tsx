import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { meQuery } from "@/lib/query";
import { navGroups } from "./nav-items";

export function NavMain() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  const me = useQuery(meQuery);
  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => me.data?.role === "admin" || item.support),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <nav aria-label="Administración">
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={pathname === item.to} tooltip={item.label}>
                    <Link to={item.to} onClick={() => isMobile && setOpenMobile(false)}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}
