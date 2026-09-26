import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Rejilla de tarjetas de métricas (patrón "metric cards" de la plantilla). */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 xl:[&>*:last-child:nth-child(odd)]:col-span-1 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {children}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  badge,
  footer,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium text-2xl tabular-nums sm:text-3xl leading-none tracking-tight">
            {value}
          </div>
          {badge}
        </div>
        {footer ? <p className="text-muted-foreground text-sm">{footer}</p> : null}
      </CardContent>
    </Card>
  );
}
