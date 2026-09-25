import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { errorMessage } from "@/lib/api";

export function FormMessage({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>No se pudo completar</AlertTitle>
      <AlertDescription>{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}
