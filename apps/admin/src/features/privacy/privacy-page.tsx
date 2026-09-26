import { zodResolver } from "@hookform/resolvers/zod";
import { adminDocumentCreateSchema, adminPublishSchema } from "@notesia/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { EmptyResult, PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { LoadMore } from "@/components/load-more";
import { Page, PageHeader } from "@/components/page-header";
import { RowActions } from "@/components/row-actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type AdminDocument, adminApi } from "@/lib/admin-api";
import { documentsQueryKey } from "@/lib/query";

const createDocumentFormSchema = adminDocumentCreateSchema
  .omit({ id: true })
  .safeExtend({ confirmation: z.literal("CREAR") });
type CreateDocumentValues = z.infer<typeof createDocumentFormSchema>;
type PublishValues = z.infer<typeof adminPublishSchema>;

function CreateDocumentDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<CreateDocumentValues>({
    resolver: zodResolver(createDocumentFormSchema),
    defaultValues: {
      type: "terms",
      language: "es",
      version: 1,
      content: "",
      confirmation: "" as never,
    },
  });
  const mutation = useMutation({
    mutationFn: ({ confirmation: _confirmation, ...values }: CreateDocumentValues) =>
      adminApi.createDocument({ id: crypto.randomUUID(), ...values }),
    onSuccess: async () => {
      form.reset();
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <FilePlus data-icon="inline-start" />
          Crear borrador
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crear borrador</DialogTitle>
          <DialogDescription>
            Introduce únicamente el texto aprobado. Crear no publica el documento
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(form.formState.errors.type)}>
              <FieldLabel>Tipo</FieldLabel>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="terms">Términos</SelectItem>
                        <SelectItem value="privacy">Privacidad</SelectItem>
                        <SelectItem value="ai">IA</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.type]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.language)}>
              <FieldLabel>Idioma</FieldLabel>
              <Controller
                control={form.control}
                name="language"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="en">Inglés</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.language]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.version)}>
              <FieldLabel htmlFor="document-version">Versión</FieldLabel>
              <Input
                id="document-version"
                type="number"
                min={1}
                aria-invalid={Boolean(form.formState.errors.version)}
                {...form.register("version", { valueAsNumber: true })}
              />
              <FieldError errors={[form.formState.errors.version]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.content)}>
              <FieldLabel htmlFor="document-content">Contenido aprobado</FieldLabel>
              <Textarea
                id="document-content"
                rows={14}
                aria-invalid={Boolean(form.formState.errors.content)}
                {...form.register("content")}
              />
              <FieldError errors={[form.formState.errors.content]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.confirmation)}>
              <FieldLabel htmlFor="create-document-confirmation">Escribe CREAR</FieldLabel>
              <Input
                id="create-document-confirmation"
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.confirmation)}
                {...form.register("confirmation")}
              />
              <FieldError errors={[form.formState.errors.confirmation]} />
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                Crear borrador
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PublishDialog({
  document,
  open,
  setOpen,
}: {
  document: AdminDocument;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<PublishValues>({
    resolver: zodResolver(adminPublishSchema),
    defaultValues: { confirmation: "" as never },
  });
  const mutation = useMutation({
    mutationFn: (values: PublishValues) => adminApi.publishDocument(document.id, values),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
  });
  // Al abrir desde el menú, la confirmación empieza vacía.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al abrir
  useEffect(() => {
    if (open) form.reset({ confirmation: "" as never });
  }, [open]);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publicar documento</AlertDialogTitle>
          <AlertDialogDescription>
            Publicarás {document.type} {document.language} versión {document.version}. Los usuarios
            verán esta versión y deberán registrar su decisión
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(form.formState.errors.confirmation)}>
              <FieldLabel htmlFor={`publish-${document.id}`}>Escribe PUBLICAR</FieldLabel>
              <Input
                id={`publish-${document.id}`}
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.confirmation)}
                {...form.register("confirmation")}
              />
              <FieldError errors={[form.formState.errors.confirmation]} />
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                Publicar
              </Button>
            </AlertDialogFooter>
          </FieldGroup>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function documentName(document: AdminDocument) {
  return `${document.type} · ${document.language} · v${document.version}`;
}

function DocumentDialog({
  document,
  open,
  setOpen,
}: {
  document: AdminDocument;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{documentName(document)}</DialogTitle>
          <DialogDescription>
            {document.publishedAt
              ? `Publicado el ${new Date(document.publishedAt).toLocaleString()}`
              : "Borrador sin publicar"}
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 font-sans text-sm">
          {document.content}
        </pre>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentActions({ document }: { document: AdminDocument }) {
  const [open, setOpen] = useState<"view" | "publish" | null>(null);
  const toggle = (dialog: "view" | "publish") => (next: boolean) => setOpen(next ? dialog : null);
  return (
    <RowActions
      actions={[
        { label: "Ver texto", select: () => setOpen("view") },
        ...(document.publishedAt ? [] : [{ label: "Publicar", select: () => setOpen("publish") }]),
      ]}
    >
      <DocumentDialog document={document} open={open === "view"} setOpen={toggle("view")} />
      {document.publishedAt ? null : (
        <PublishDialog document={document} open={open === "publish"} setOpen={toggle("publish")} />
      )}
    </RowActions>
  );
}

export function PrivacyPage() {
  const query = useInfiniteQuery({
    queryKey: documentsQueryKey,
    queryFn: ({ pageParam }) => adminApi.documents(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  if (query.isPending) return <PageLoading />;
  if (query.isError) return <PageError error={query.error} retry={() => query.refetch()} />;
  const documents = query.data.pages.flatMap((page) => page.items);
  return (
    <Page>
      <PageHeader
        title="Privacidad y términos"
        description="Crea versiones y publícalas solo después de su aprobación"
        actions={<CreateDocumentDialog />}
      />
      {documents.length === 0 ? (
        <EmptyResult message="No hay documentos creados" />
      ) : (
        <DataTable columns={["Documento", "Estado", "Creado", "Publicado", ""]}>
          {documents.map((document) => (
            <TableRow key={document.id}>
              <TableCell className="font-medium">{documentName(document)}</TableCell>
              <TableCell>
                <Badge variant={document.publishedAt ? "secondary" : "outline"}>
                  {document.publishedAt ? "publicado" : "borrador"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(document.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {document.publishedAt ? new Date(document.publishedAt).toLocaleString() : "—"}
              </TableCell>
              <TableCell className="w-12 text-right">
                <DocumentActions document={document} />
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
