import { useInfiniteQuery } from "@tanstack/react-query";
import { EmptyResult, PageError, PageLoading } from "@/components/async-state";
import { LoadMore } from "@/components/load-more";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminApi } from "@/lib/admin-api";
import { auditQueryKey } from "@/lib/query";

export function AuditPage() {
  const query = useInfiniteQuery({
    queryKey: auditQueryKey,
    queryFn: ({ pageParam }) => adminApi.audit(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  if (query.isPending) return <PageLoading />;
  if (query.isError) return <PageError error={query.error} retry={() => query.refetch()} />;
  const records = query.data.pages.flatMap((page) => page.items);
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1>Auditoría administrativa</h1>
        <p>Registro inmutable de operaciones sensibles.</p>
      </header>
      {records.length === 0 ? (
        <EmptyResult message="Todavía no hay acciones administrativas." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Objetivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{new Date(record.recordedAt).toLocaleString()}</TableCell>
                <TableCell>{record.action}</TableCell>
                <TableCell>
                  <code>{record.actorId}</code>
                </TableCell>
                <TableCell>
                  <code>{record.targetId}</code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <LoadMore
        hasMore={query.hasNextPage}
        loading={query.isFetchingNextPage}
        load={() => query.fetchNextPage()}
      />
    </section>
  );
}
