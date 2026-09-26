import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BrainCircuit,
  LifeBuoy,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";

export type NavItem = {
  to: "/" | "/users" | "/roles" | "/privacy" | "/ai" | "/audit" | "/reports";
  label: string;
  icon: LucideIcon;
  /** Soporte solo ve lo marcado; el administrador ve todo. */
  support?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { to: "/", label: "Salud", icon: Activity },
      { to: "/reports", label: "Reportes", icon: LifeBuoy, support: true },
      { to: "/ai", label: "IA", icon: BrainCircuit },
    ],
  },
  {
    label: "Acceso",
    items: [
      { to: "/users", label: "Usuarios", icon: Users, support: true },
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
