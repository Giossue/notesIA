import MaterialDesignIcons from "@react-native-vector-icons/material-design-icons";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowUp,
  Ban,
  Bell,
  BellRing,
  BookOpen,
  BookOpenText,
  Briefcase,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleCheckBig,
  CircleMinus,
  CircleX,
  ClipboardList,
  Clock,
  CloudCheck,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Folder,
  GraduationCap,
  Heart,
  House,
  Info,
  KeyRound,
  LayoutGrid,
  Lock,
  LockOpen,
  LogIn,
  LogOut,
  type LucideIcon,
  Mail,
  MailCheck,
  Mic,
  Minus,
  Moon,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Square,
  SquareCheckBig,
  SquareMinus,
  Target,
  Timer,
  Trash2,
  Trophy,
  Undo2,
  User,
  UserRoundCheck,
  X,
} from "lucide-react-native";
import type { ComponentProps, ReactNode } from "react";

type Entry = LucideIcon | { icon: LucideIcon; filled: true };

/**
 * Nombres que usa la app (heredados de Material Design Icons) → Lucide.
 * También cubre los que React Native Paper pide internamente (casillas,
 * menús, paginación, cerrar). Un nombre sin entrada cae a Material Design
 * Icons para no romper la pantalla.
 */
const icons: Record<string, Entry> = {
  // Navegación y encabezados
  home: { icon: House, filled: true },
  "home-outline": House,
  "calendar-blank": Calendar,
  "calendar-blank-outline": Calendar,
  calendar: Calendar,
  "calendar-month-outline": CalendarDays,
  "calendar-check-outline": CalendarCheck,
  "calendar-plus": CalendarPlus,
  "chart-bar": ChartColumn,
  account: { icon: User, filled: true },
  "account-outline": User,
  "account-clock-outline": UserRoundCheck,
  "dots-grid": LayoutGrid,
  "dots-horizontal": Ellipsis,
  "dots-vertical": EllipsisVertical,
  "arrow-left": ArrowLeft,
  "arrow-up": ArrowUp,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "menu-down": ChevronDown,
  "page-first": ChevronsLeft,
  "page-last": ChevronsRight,
  "cog-outline": Settings,
  cog: Settings,
  magnify: Search,
  // Acciones
  plus: Plus,
  close: X,
  check: Check,
  pencil: Pencil,
  "pencil-outline": Pencil,
  delete: Trash2,
  "delete-outline": Trash2,
  archive: Archive,
  "archive-outline": Archive,
  "archive-arrow-up": ArchiveRestore,
  refresh: RefreshCw,
  repeat: Repeat,
  undo: Undo2,
  "content-save": Save,
  play: Play,
  stop: Square,
  microphone: Mic,
  logout: LogOut,
  eye: Eye,
  "eye-outline": Eye,
  restore: RotateCcw,
  "minus-circle-outline": CircleMinus,
  "close-circle-outline": CircleX,
  "check-all": CheckCheck,
  "lock-outline": Lock,
  "lock-open-outline": LockOpen,
  "send-outline": Send,
  "download-outline": Download,
  "calculator-variant-outline": Calculator,
  login: LogIn,
  "email-check-outline": MailCheck,
  "email-sync-outline": Mail,
  "lock-reset": KeyRound,
  "open-in-new": ExternalLink,
  "shield-off-outline": ShieldOff,
  "auto-fix": Sparkles,
  "chevron-down": ChevronDown,
  "content-save-outline": Save,
  sync: RefreshCw,
  "eye-off": EyeOff,
  // Estado
  "checkbox-marked-circle-outline": CircleCheckBig,
  "check-circle-outline": CircleCheck,
  "checkbox-marked": SquareCheckBig,
  "checkbox-blank-outline": Square,
  "minus-box": SquareMinus,
  "cloud-check-outline": CloudCheck,
  alert: CircleAlert,
  information: Info,
  cancel: Ban,
  minus: Minus,
  circle: Circle,
  // Contenido
  bell: { icon: Bell, filled: true },
  "bell-outline": Bell,
  "bell-check-outline": BellRing,
  "book-open-outline": BookOpen,
  "book-outline": BookOpen,
  "book-open-page-variant-outline": BookOpenText,
  "briefcase-outline": Briefcase,
  "clipboard-text-outline": ClipboardList,
  "file-document-outline": FileText,
  "school-outline": GraduationCap,
  "folder-outline": Folder,
  folder: Folder,
  "heart-outline": Heart,
  fire: Flame,
  target: Target,
  "timer-outline": Timer,
  "clock-outline": Clock,
  "trophy-outline": Trophy,
  "shield-lock-outline": ShieldCheck,
  "weather-night": Moon,
  email: Mail,
};

export const knownIconNames = Object.keys(icons);

type IconProps = { name: string; color?: string; size: number; testID?: string };

export function renderIcon({ name, color, size, testID }: IconProps): ReactNode {
  const entry = icons[name];
  if (!entry) {
    return (
      <MaterialDesignIcons
        name={name as ComponentProps<typeof MaterialDesignIcons>["name"]}
        color={color}
        size={size}
        testID={testID}
      />
    );
  }
  const Component = "icon" in entry ? entry.icon : entry;
  const filled = "filled" in entry;
  return (
    <Component
      color={color}
      size={size}
      strokeWidth={2}
      fill={filled ? color : "none"}
      testID={testID}
    />
  );
}
