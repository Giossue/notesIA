import { zodResolver } from "@hookform/resolvers/zod";
import { adminDocumentCreateSchema } from "@notesia/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { Page, PageHeader } from "@/components/page-header";
import { RowActions } from "@/components/row-actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type AdminDocument, adminApi } from "@/lib/admin-api";
import { documentsQueryKey } from "@/lib/query";

type DocumentType = AdminDocument["type"];

/** Documentos fijos del sistema; la app pide aceptar términos y privacidad, IA es opcional. */
const documentTypes: { type: DocumentType; name: string }[] = [
  { type: "terms", name: "Términos de uso" },
  { type: "privacy", name: "Política de privacidad" },
  { type: "ai", name: "Consentimiento de IA" },
];
const LANGUAGE = "es";

const editFormSchema = z.object({
  content: adminDocumentCreateSchema.shape.content,
  confirmation: z.literal("PUBLICAR"),
});
type EditValues = z.infer<typeof editFormSchema>;

const formatDate = (value: string) => new Date(value).toLocaleString();

/**
 * Una versión publicada no se modifica: cada consentimiento guarda la versión
 * exacta que aceptó el usuario. Editar crea y publica la versión siguiente, y
 * la app vuelve a pedir la aceptación.
 */
function EditDocumentDialog({
  name,
  type,
  current,
  nextVersion,
  open,
  setOpen,
}: {
  name: string;
  type: DocumentType;
  current?: AdminDocument;
  nextVersion: number;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<EditValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: { content: current?.content ?? "", confirmation: "PUBLICAR" },
  });
  const mutation = useMutation({
    mutationFn: async ({ content }: EditValues) => {
      const created = await adminApi.createDocument({
        id: crypto.randomUUID(),
        type,
        language: LANGUAGE,
        version: nextVersion,
        content,
      });
      return adminApi.publishDocument(created.id, { confirmation: "PUBLICAR" });
    },
    onSuccess: () => setOpen(false),
    // También si falla la publicación: el borrador creado ya ocupa su número de versión.
    onSettled: () => queryClient.invalidateQueries({ queryKey: documentsQueryKey }),
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al abrir
  useEffect(() => {
    if (!open) return;
    mutation.reset();
    form.reset({ content: current?.content ?? "", confirmation: "PUBLICAR" });
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar {name.toLocaleLowerCase("es")}</DialogTitle>
          <DialogDescription>
            Al guardar se publica la versión {nextVersion} y los usuarios deberán aceptarla de nuevo
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(form.formState.errors.content)}>
              <FieldLabel htmlFor={`content-${type}`}>Contenido</FieldLabel>
              <Textarea
                id={`content-${type}`}
                rows={18}
                className="max-h-[50svh]"
                aria-invalid={Boolean(form.formState.errors.content)}
                {...form.register("content")}
              />
              <FieldError errors={[form.formState.errors.content]} />
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                Publicar versión {nextVersion}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocumentDialog({
  name,
  document,
  open,
  setOpen,
}: {
  name: string;
  document: AdminDocument;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {name} · versión {document.version}
          </DialogTitle>
          <DialogDescription>
            {document.publishedAt
              ? `Publicada el ${formatDate(document.publishedAt)}`
              : "Sin publicar"}
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

function HistoryDialog({
  name,
  versions,
  open,
  setOpen,
}: {
  name: string;
  versions: AdminDocument[];
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [viewing, setViewing] = useState<AdminDocument | null>(null);
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historial de {name.toLocaleLowerCase("es")}</DialogTitle>
            <DialogDescription>Versiones anteriores, solo lectura</DialogDescription>
          </DialogHeader>
          <DataTable columns={["Versión", "Estado", "Publicada", "Acciones"]}>
            {versions.map((version) => (
              <TableRow key={version.id}>
                <TableCell className="font-medium">v{version.version}</TableCell>
                <TableCell>
                  <StatusBadge tone={version.publishedAt ? "success" : "neutral"}>
                    {version.publishedAt ? "publicada" : "sin publicar"}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {version.publishedAt ? formatDate(version.publishedAt) : "—"}
                </TableCell>
                <TableCell className="w-12 text-right">
                  <RowActions
                    actions={[{ label: "Ver texto", select: () => setViewing(version) }]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        </DialogContent>
      </Dialog>
      {viewing ? (
        <DocumentDialog
          name={name}
          document={viewing}
          open
          setOpen={(next) => !next && setViewing(null)}
        />
      ) : null}
    </>
  );
}

function DocumentRow({
  name,
  type,
  versions,
}: {
  name: string;
  type: DocumentType;
  /** Todas las versiones del tipo, de la más nueva a la más antigua. */
  versions: AdminDocument[];
}) {
  const [open, setOpen] = useState<"view" | "edit" | "history" | null>(null);
  const toggle = (dialog: "view" | "edit" | "history") => (next: boolean) =>
    setOpen(next ? dialog : null);
  const current = versions.find((version) => version.publishedAt);
  const nextVersion = (versions[0]?.version ?? 0) + 1;
  return (
    <TableRow>
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell className="tabular-nums">{current ? `v${current.version}` : "—"}</TableCell>
      <TableCell>
        <StatusBadge tone={current ? "success" : "neutral"}>
          {current ? "vigente" : "sin publicar"}
        </StatusBadge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {current?.publishedAt ? formatDate(current.publishedAt) : "—"}
      </TableCell>
      <TableCell className="w-12 text-right">
        <RowActions
          actions={[
            ...(current ? [{ label: "Ver texto", select: () => setOpen("view") }] : []),
            { label: current ? "Editar" : "Redactar", select: () => setOpen("edit") },
            ...(versions.length > 1 || (versions.length === 1 && !current)
              ? [{ label: "Historial", select: () => setOpen("history") }]
              : []),
          ]}
        >
          {current ? (
            <DocumentDialog
              name={name}
              document={current}
              open={open === "view"}
              setOpen={toggle("view")}
            />
          ) : null}
          <EditDocumentDialog
            name={name}
            type={type}
            current={current}
            nextVersion={nextVersion}
            open={open === "edit"}
            setOpen={toggle("edit")}
          />
          <HistoryDialog
            name={name}
            versions={versions}
            open={open === "history"}
            setOpen={toggle("history")}
          />
        </RowActions>
      </TableCell>
    </TableRow>
  );
}

export function PrivacyPage() {
  const query = useInfiniteQuery({
    queryKey: documentsQueryKey,
    queryFn: ({ pageParam }) => adminApi.documents(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  // Se necesitan todas las versiones para saber la vigente y el siguiente número.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  if (query.isPending || query.hasNextPage) return <PageLoading />;
  if (query.isError) return <PageError error={query.error} retry={() => query.refetch()} />;
  const documents = query.data.pages
    .flatMap((page) => page.items)
    .filter((document) => document.language === LANGUAGE)
    .sort((a, b) => b.version - a.version);
  return (
    <Page>
      <PageHeader
        title="Privacidad y términos"
        description="Al editar un documento se publica una versión nueva y los usuarios deben aceptarla otra vez"
      />
      <DataTable columns={["Documento", "Versión", "Estado", "Publicada", "Acciones"]}>
        {documentTypes.map(({ type, name }) => (
          <DocumentRow
            key={type}
            name={name}
            type={type}
            versions={documents.filter((document) => document.type === type)}
          />
        ))}
      </DataTable>
    </Page>
  );
}
