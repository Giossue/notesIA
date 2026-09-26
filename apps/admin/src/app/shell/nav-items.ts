import type { LucideIcon } from "lucide-react";
import { Activity, BrainCircuit, ScrollText, ShieldCheck, UserCog, Users } from "lucide-react";

export type NavItem = {
  to: "/" | "/users" | "/roles" | "/privacy" | "/ai" | "/audit";
  label: string;
  icon: LucideIcon;
};

export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { to: "/", label: "Salud", icon: Activity },
      { to: "/ai", label: "IA", icon: BrainCircuit },
    ],
  },
  {
    label: "Acceso",
    items: [
      { to: "/users", label: "Usuarios", icon: Users },
      { to: "/roles", label: "Roles", icon: UserCog },
    ],
  },
  {
    label: "Cumplimiento",
    items: [
      { to: "/privacy", label: "Privacidad", icon: ShieldCheck },
      { to: "/audit", label: "Auditoría", icon: ScrollText },
    ],
  },
];

export const navItems = navGroups.flatMap((group) => group.items);
