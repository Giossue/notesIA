import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function LoadMore({
  hasMore,
  loading,
  load,
}: {
  hasMore: boolean;
  loading: boolean;
  load: () => void;
}) {
  if (!hasMore) return null;
  return (
    <Button variant="outline" onClick={load} disabled={loading}>
      {loading ? <Spinner data-icon="inline-start" /> : null}
      Cargar más
    </Button>
  );
}
