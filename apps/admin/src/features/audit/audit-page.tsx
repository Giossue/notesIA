import { useInfiniteQuery } from "@tanstack/react-query";
import { EmptyResult, PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { LoadMore } from "@/components/load-more";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { type AdminAudit, adminApi } from "@/lib/admin-api";
import { auditActionLabels, label, providerLabels } from "@/lib/labels";
import { auditQueryKey } from "@/lib/query";

const documentLabels = {
  terms: "Términos de uso",
  privacy: "Política de privacidad",
  ai: "Consentimiento de IA",
} as const;

/** Lo afectado: el correo de la cuenta, el documento legal o el proveedor de IA. */
function AuditTarget({ record }: { record: AdminAudit }) {
  const target = record.target;
  if (!target) return <span className="text-muted-foreground">Ya no existe</span>;
  if (target.kind === "user") return <>{target.email}</>;
  if (target.kind === "document")
    return (
      <>
        {documentLabels[target.type]} · versión {target.version}
      </>
    );
  if (target.kind === "suggestion") return <>Sugerencia: «{target.text}»</>;
  return <>{providerLabels[target.provider]}</>;
}

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
        <DataTable columns={["Fecha", "Acción", "Realizada por", "Afectado"]}>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="text-muted-foreground">
                {new Date(record.recordedAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <StatusBadge>{label(auditActionLabels, record.action)}</StatusBadge>
              </TableCell>
              <TableCell>
                {record.actorEmail ?? (
                  <span className="text-muted-foreground">Cuenta eliminada</span>
                )}
              </TableCell>
              <TableCell>
                <AuditTarget record={record} />
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
