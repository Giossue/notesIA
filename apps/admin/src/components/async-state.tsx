import { CircleAlert, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

export function PageLoading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6" role="status" aria-label="Cargando">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

/**
 * Sección que no cargó. El motivo ya se avisó con un toast (QueryCache en
 * main.tsx); aquí solo queda el hueco y la opción de reintentar.
 */
export function PageError({ retry }: { error?: unknown; retry?: () => void }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlert />
        </EmptyMedia>
        <EmptyTitle>Sin datos</EmptyTitle>
      </EmptyHeader>
      {retry ? (
        <Button size="sm" variant="outline" onClick={retry}>
          Reintentar
        </Button>
      ) : null}
    </Empty>
  );
}

export function EmptyResult({ message }: { message: string }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox />
        </EmptyMedia>
        <EmptyTitle>Sin resultados</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
