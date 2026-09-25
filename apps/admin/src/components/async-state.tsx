import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";

export function PageLoading() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Cargando">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function PageError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>No se pudo cargar</AlertTitle>
      <AlertDescription>{errorMessage(error)}</AlertDescription>
      {retry ? <Button onClick={retry}>Reintentar</Button> : null}
    </Alert>
  );
}

export function EmptyResult({ message }: { message: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Sin resultados</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
