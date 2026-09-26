import { useInfiniteQuery } from "@tanstack/react-query";
import { EmptyResult, PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { LoadMore } from "@/components/load-more";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
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
    <Page>
      <PageHeader
        title="Auditoría administrativa"
        description="Registro inmutable de operaciones sensibles"
      />
      {records.length === 0 ? (
        <EmptyResult message="Todavía no hay acciones administrativas" />
      ) : (
        <DataTable columns={["Fecha", "Acción", "Actor", "Objetivo"]}>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="text-muted-foreground">
                {new Date(record.recordedAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <StatusBadge>{record.action}</StatusBadge>
              </TableCell>
              <TableCell>
                <code className="text-muted-foreground text-xs">{record.actorId}</code>
              </TableCell>
              <TableCell>
                <code className="text-muted-foreground text-xs">{record.targetId}</code>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
      <LoadMore
        hasMore={query.hasNextPage}
        loading={query.isFetchingNextPage}
        load={() => query.fetchNextPage()}
      />
    </Page>
  );
}
