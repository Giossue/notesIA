import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyResult, PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { LoadMore } from "@/components/load-more";
import { Page, PageHeader } from "@/components/page-header";
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { adminApi } from "@/lib/admin-api";
import { announcementsQueryKey, auditQueryKey } from "@/lib/query";

type Audience = "all" | "one";

/** Escribir un aviso: vista previa y, si va a todos, una confirmación explícita. */
function AnnouncementDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  // Un id por aviso: si la red falla y se reintenta, no se envía dos veces.
  const [id] = useState(() => crypto.randomUUID());
  const [audience, setAudience] = useState<Audience>("one");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      adminApi.sendAnnouncement({
        id,
        title: title.trim(),
        body: body.trim(),
        recipientEmail: audience === "one" ? email.trim().toLowerCase() : null,
      }),
    onSuccess: async (sent) => {
      toast.success(
        sent.recipients === 1
          ? "Aviso enviado a 1 estudiante"
          : `Aviso enviado a ${sent.recipients} estudiantes`,
      );
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: announcementsQueryKey }),
        queryClient.invalidateQueries({ queryKey: auditQueryKey }),
      ]);
    },
    onSettled: () => setConfirming(false),
  });
  const validEmail = audience === "all" || /^\S+@\S+\.\S+$/.test(email.trim());
  const valid =
    validEmail &&
    title.trim().length >= 1 &&
    title.trim().length <= 60 &&
    body.trim().length >= 1 &&
    body.trim().length <= 300;
  const submit = () => {
    if (audience === "all" && !confirming) setConfirming(true);
    else send.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo aviso</DialogTitle>
          <DialogDescription>
            Llega como notificación y queda en el historial de avisos de la app, aunque el
            estudiante no tenga el push activado
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Para</FieldLabel>
            <Tabs
              value={audience}
              onValueChange={(value) => {
                setAudience(value as Audience);
                setConfirming(false);
              }}
            >
              <TabsList>
                <TabsTrigger value="one">Un estudiante</TabsTrigger>
                <TabsTrigger value="all">Todos los estudiantes</TabsTrigger>
              </TabsList>
            </Tabs>
          </Field>
          {audience === "one" && (
            <Field>
              <FieldLabel htmlFor="announcement-email">Correo del estudiante</FieldLabel>
              <Input
                id="announcement-email"
                type="email"
                value={email}
                placeholder="estudiante@correo.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="announcement-title">Título</FieldLabel>
            <Input
              id="announcement-title"
              value={title}
              maxLength={60}
              placeholder="Por ejemplo: Mantenimiento esta noche"
              onChange={(event) => setTitle(event.target.value)}
            />
            <FieldDescription>{title.trim().length}/60 caracteres</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="announcement-body">Mensaje</FieldLabel>
            <Textarea
              id="announcement-body"
              value={body}
              maxLength={300}
              rows={4}
              onChange={(event) => setBody(event.target.value)}
            />
            <FieldDescription>
              {body.trim().length}/300 caracteres · Si el estudiante está en su horario «No
              molestar», el push le llega cuando termine
            </FieldDescription>
          </Field>
        </FieldGroup>
        {confirming && (
          <p className="rounded-md border border-destructive/40 p-3 text-sm">
            Se enviará a <strong>todos los estudiantes</strong> con los avisos activados. No se
            puede deshacer.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant={confirming ? "destructive" : "default"}
            disabled={!valid || send.isPending}
            onClick={submit}
          >
            {send.isPending ? <Spinner data-icon="inline-start" /> : null}
            {confirming ? "Confirmar envío a todos" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

/** Avisos escritos por el equipo: a un estudiante o a todos, con su historial. */
export function AnnouncementsPage() {
  const [writing, setWriting] = useState(false);
  const query = useInfiniteQuery({
    queryKey: announcementsQueryKey,
    queryFn: ({ pageParam }) => adminApi.announcements(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Page>
      <PageHeader
        title="Avisos"
        description="Mensajes que llegan como notificación a la app de los estudiantes"
        actions={
          <Button onClick={() => setWriting(true)}>
            <Send data-icon="inline-start" />
            Nuevo aviso
          </Button>
        }
      />
      {query.isPending ? (
        <PageLoading />
      ) : query.isError ? (
        <PageError error={query.error} retry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyResult message="Todavía no se ha enviado ningún aviso" />
      ) : (
        <DataTable columns={["Aviso", "Para", "Recibieron", "Enviado"]}>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="whitespace-normal">
                <div className="font-medium">{item.title}</div>
                <div className="text-muted-foreground text-sm">{item.body}</div>
              </TableCell>
              <TableCell>{item.recipientEmail ?? "Todos"}</TableCell>
              <TableCell>{item.recipients}</TableCell>
              <TableCell className="whitespace-normal">
                {dateFormat.format(new Date(item.createdAt))}
                {item.authorEmail ? (
                  <div className="text-muted-foreground text-sm">{item.authorEmail}</div>
                ) : null}
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
      {writing && <AnnouncementDialog open={writing} setOpen={setWriting} />}
    </Page>
  );
}
