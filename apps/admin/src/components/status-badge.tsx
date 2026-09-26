import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tones = {
  success: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  danger: "border-transparent bg-destructive/15 text-destructive",
  neutral: "",
} as const;

/**
 * Badge único del panel: el mismo estado se ve igual en todas las tablas.
 * success = activo/publicado/habilitado, danger = suspendido/fallo,
 * neutral = etiquetas y valores sin juicio (roles, acciones, borradores).
 */
export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn(tones[tone])}>
      {children}
    </Badge>
  );
}
