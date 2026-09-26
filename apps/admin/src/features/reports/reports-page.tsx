import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyResult, PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { LoadMore } from "@/components/load-more";
import { Page, PageHeader } from "@/components/page-header";
import { RowActions } from "@/components/row-actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { type AdminReport, adminApi, type ReportStatus } from "@/lib/admin-api";
import { meQuery, reportsQueryKey } from "@/lib/query";

const typeLabels = {
  bug: "Problema o error",
  suggestion: "Sugerencia",
  account: "Cuenta o acceso",
  other: "Otro",
} as const;
const statusLabels: Record<ReportStatus, string> = {
  new: "Nuevo",
  in_review: "En revisión",
  resolved: "Resuelto",
  closed: "Cerrado",
};
const statusTones = {
  new: "danger",
  in_review: "neutral",
  resolved: "success",
  closed: "neutral",
} as const;
const historyLabels = {
  created: "Reporte enviado",
  assigned: "Asignado",
  status_changed: "Cambio de estado",
  replied: "Respuesta enviada",
} as const;

function ReportDialog({
  report,
  open,
  setOpen,
}: {
  report: AdminReport;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const me = useQuery(meQuery);
  const detail = useQuery({
    queryKey: [...reportsQueryKey, "detail", report.id],
    queryFn: () => adminApi.report(report.id),
    enabled: open,
  });
  const [status, setStatus] = useState<ReportStatus>(report.status);
  const [reply, setReply] = useState("");
  const data = detail.data;
  const update = useMutation({
    mutationFn: (change: { status?: ReportStatus; assignToMe?: boolean; reply?: string }) =>
      adminApi.updateReport(report.id, { version: data?.version ?? report.version, ...change }),
    onSuccess: async (updated, change) => {
      toast.success(
        change.reply
          ? "Respuesta enviada: el estudiante recibirá un aviso"
          : change.assignToMe
            ? "Reporte asignado a ti"
            : `Estado: ${statusLabels[updated.status]}`,
      );
      setReply("");
      setStatus(updated.status);
      await queryClient.invalidateQueries({ queryKey: reportsQueryKey });
    },
  });
  const mine = data?.assigneeId === me.data?.userId;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{report.title}</DialogTitle>
          <DialogDescription>
            {typeLabels[report.type]} · {report.userName} ({report.userEmail}) ·{" "}
            {new Date(report.createdAt).toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={statusTones[data.status]}>
                  {statusLabels[data.status]}
                </StatusBadge>
                <span className="text-muted-foreground text-sm">
                  {data.assigneeEmail ? `Asignado a ${data.assigneeEmail}` : "Sin asignar"}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{data.description}</p>
              <p className="text-muted-foreground text-xs">
                {[
                  data.context.platform,
                  data.context.osVersion && `sistema ${data.context.osVersion}`,
                  data.context.appVersion && `app ${data.context.appVersion}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Sin datos técnicos"}
              </p>
            </section>
            {data.reply && (
              <section className="rounded-md border p-3">
                <h3 className="font-medium text-sm">Última respuesta</h3>
                <p className="whitespace-pre-wrap text-sm">{data.reply}</p>
              </section>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="report-reply">Responder al estudiante</FieldLabel>
                <Textarea
                  id="report-reply"
                  rows={4}
                  maxLength={2000}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="La verá en la app, en Ayuda y reportes, y recibirá un aviso"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="report-status">Estado</FieldLabel>
                <Select value={status} onValueChange={(value) => setStatus(value as ReportStatus)}>
                  <SelectTrigger id="report-status" className="w-full sm:w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(Object.keys(statusLabels) as ReportStatus[]).map((value) => (
                        <SelectItem key={value} value={value}>
                          {statusLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Al marcarlo resuelto o cerrado, el estudiante recibe un aviso
                </FieldDescription>
              </Field>
            </FieldGroup>
            <section className="flex flex-col gap-2">
              <h3 className="font-medium text-sm">Historial</h3>
              <ol className="flex flex-col gap-1">
                {data.history.map((item) => (
                  <li key={`${item.action}-${item.recordedAt}`} className="text-sm">
                    <span className="text-muted-foreground">
                      {new Date(item.recordedAt).toLocaleString()} ·{" "}
                    </span>
                    {historyLabels[item.action]}
                    {item.action === "status_changed" &&
                      typeof item.detail.to === "string" &&
                      `: ${statusLabels[item.detail.to as ReportStatus] ?? item.detail.to}`}
                    {item.actorEmail && (
                      <span className="text-muted-foreground"> · {item.actorEmail}</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
        <DialogFooter className="gap-2">
          {data && !mine && (
            <Button
              variant="outline"
              disabled={update.isPending}
              onClick={() => update.mutate({ assignToMe: true })}
            >
              Asignarme
            </Button>
          )}
          <Button
            disabled={!data || update.isPending || (!reply.trim() && status === data?.status)}
            onClick={() =>
              update.mutate({
                ...(status !== data?.status ? { status } : {}),
                ...(reply.trim() ? { reply: reply.trim() } : {}),
              })
            }
          >
            {update.isPending ? <Spinner data-icon="inline-start" /> : null}
            {reply.trim() ? "Enviar respuesta" : "Guardar estado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportActions({ report }: { report: AdminReport }) {
  const [open, setOpen] = useState(false);
  return (
    <RowActions actions={[{ label: "Ver", select: () => setOpen(true) }]}>
      {open && <ReportDialog report={report} open={open} setOpen={setOpen} />}
    </RowActions>
  );
}

type Filter = ReportStatus | "all";

export function ReportsPage() {
  const [filter, setFilter] = useState<Filter>("new");
  const query = useInfiniteQuery({
    queryKey: [...reportsQueryKey, filter],
    queryFn: ({ pageParam }) => adminApi.reports(filter === "all" ? null : filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const reports = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Page>
      <PageHeader
        title="Reportes"
        description="Problemas y sugerencias que envían los estudiantes desde la app"
      />
      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
        <TabsList>
          <TabsTrigger value="new">Nuevos</TabsTrigger>
          <TabsTrigger value="in_review">En revisión</TabsTrigger>
          <TabsTrigger value="resolved">Resueltos</TabsTrigger>
          <TabsTrigger value="closed">Cerrados</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>
      </Tabs>
      {query.isPending ? (
        <PageLoading />
      ) : query.isError ? (
        <PageError error={query.error} retry={() => query.refetch()} />
      ) : reports.length === 0 ? (
        <EmptyResult message="No hay reportes en esta lista" />
      ) : (
        <DataTable
          columns={["Fecha", "Estudiante", "Tipo", "Título", "Estado", "Asignado", "Acciones"]}
        >
          {reports.map((report) => (
            <TableRow key={report.id}>
              <TableCell className="text-muted-foreground">
                {new Date(report.createdAt).toLocaleString()}
              </TableCell>
              <TableCell>{report.userEmail}</TableCell>
              <TableCell>{typeLabels[report.type]}</TableCell>
              <TableCell className="max-w-64 truncate">{report.title}</TableCell>
              <TableCell>
                <StatusBadge tone={statusTones[report.status]}>
                  {statusLabels[report.status]}
                </StatusBadge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {report.assigneeEmail ?? "Sin asignar"}
              </TableCell>
              <TableCell className="w-12 text-right">
                <ReportActions report={report} />
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
