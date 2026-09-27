import { zodResolver } from "@hookform/resolvers/zod";
import { adminUserSuspensionSchema } from "@notesia/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { EmptyResult, PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { LoadMore } from "@/components/load-more";
import { Page, PageHeader } from "@/components/page-header";
import { RowActions } from "@/components/row-actions";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { type AdminUser, adminApi } from "@/lib/admin-api";
import { roleLabel } from "@/lib/labels";
import { meQuery, rolesQueryKey, usersQueryKey } from "@/lib/query";

type SuspensionValues = z.infer<typeof adminUserSuspensionSchema>;

function SuspensionDialog({
  user,
  open,
  setOpen,
}: {
  user: AdminUser;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const suspended = user.suspendedAt === null;
  const confirmation = suspended ? "SUSPENDER" : "REACTIVAR";
  const form = useForm<SuspensionValues>({
    resolver: zodResolver(adminUserSuspensionSchema),
    defaultValues: {
      suspended,
      version: user.version,
      confirmation,
      password: "",
    },
  });
  const mutation = useMutation({
    mutationFn: (values: SuspensionValues) => adminApi.setSuspension(user.id, values),
    onSuccess: async (_result, values) => {
      toast.success(values.suspended ? "Cuenta suspendida" : "Cuenta reactivada");
      setOpen(false);
      form.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
        queryClient.invalidateQueries({ queryKey: rolesQueryKey }),
      ]);
    },
  });
  // Al abrir desde el menú, el formulario parte de los datos actuales de la fila.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al abrir
  useEffect(() => {
    if (!open) return;
    form.reset({
      suspended,
      version: user.version,
      confirmation,
      password: "",
    });
  }, [open]);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation} cuenta</AlertDialogTitle>
          <AlertDialogDescription>
            Confirma el cambio para {user.email}. La operación quedará auditada
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(form.formState.errors.password)}>
              <FieldLabel htmlFor={`password-${user.id}`}>Contraseña actual</FieldLabel>
              <Input
                id={`password-${user.id}`}
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                {...form.register("password")}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <Button
                type="submit"
                variant={suspended ? "destructive" : "default"}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                Confirmar
              </Button>
            </AlertDialogFooter>
          </FieldGroup>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function UserActions({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const me = useQuery(meQuery);
  const suspended = user.suspendedAt === null;
  // Solo un administrador suspende, y nunca a otro administrador (primero se le quita el rol).
  const canSuspend = me.data?.role === "admin" && !(suspended && user.role === "admin");
  return (
    <RowActions
      actions={[
        { label: "Ver", select: () => setViewing(true) },
        ...(canSuspend
          ? [
              {
                label: suspended ? "Suspender" : "Reactivar",
                destructive: suspended,
                select: () => setOpen(true),
              },
            ]
          : []),
      ]}
    >
      <SuspensionDialog user={user} open={open} setOpen={setOpen} />
      <UserDetailDialog user={user} open={viewing} setOpen={setViewing} />
    </RowActions>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 last:border-b-0">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

const yesNo = (value: boolean) => (
  <StatusBadge tone={value ? "success" : "neutral"}>{value ? "Sí" : "No"}</StatusBadge>
);

function UserDetailDialog({
  user,
  open,
  setOpen,
}: {
  user: AdminUser;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const detail = useQuery({
    queryKey: [...usersQueryKey, "detail", user.id],
    queryFn: () => adminApi.userDetail(user.id),
    enabled: open,
  });
  const data = detail.data;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{user.name}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: marcadores de carga
              <Skeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <section>
              <h3 className="mb-1 font-medium text-sm">Cuenta</h3>
              <dl>
                <DetailRow label="ID">
                  <code className="text-xs">{data.id}</code>
                </DetailRow>
                <DetailRow label="Rol">
                  <StatusBadge>{roleLabel(data.role)}</StatusBadge>
                </DetailRow>
                <DetailRow label="Estado">
                  <StatusBadge tone={data.suspendedAt ? "danger" : "success"}>
                    {data.suspendedAt
                      ? `suspendida el ${new Date(data.suspendedAt).toLocaleString()}`
                      : "activa"}
                  </StatusBadge>
                </DetailRow>
                <DetailRow label="Correo verificado">{yesNo(data.emailVerified)}</DetailRow>
                <DetailRow label="Verificación en dos pasos">
                  {yesNo(data.twoFactorEnabled)}
                </DetailRow>
                <DetailRow label="Creada">{new Date(data.createdAt).toLocaleString()}</DetailRow>
                <DetailRow label="Última actualización">
                  {new Date(data.updatedAt).toLocaleString()}
                </DetailRow>
                {data.deletionRequestedAt && (
                  <DetailRow label="Eliminación solicitada">
                    <StatusBadge tone="danger">
                      {new Date(data.deletionRequestedAt).toLocaleString()}
                    </StatusBadge>
                  </DetailRow>
                )}
              </dl>
            </section>
            {data.profile && (
              <section>
                <h3 className="mb-1 font-medium text-sm">Perfil</h3>
                <dl>
                  <DetailRow label="Nombre visible">{data.profile.displayName}</DetailRow>
                  <DetailRow label="Zona horaria">{data.profile.timeZone}</DetailRow>
                  <DetailRow label="Configuración inicial">
                    {data.profile.onboardingCompleted ? "Completada" : "Pendiente"}
                  </DetailRow>
                </dl>
              </section>
            )}
            <section>
              <h3 className="mb-1 font-medium text-sm">Uso de la app</h3>
              <dl>
                <DetailRow label="Tareas">
                  {data.counts.activities} ({data.counts.completedActivities} completadas)
                </DetailRow>
                <DetailRow label="Horas ocupadas">{data.counts.commitments}</DetailRow>
                <DetailRow label="Tramos de horario de estudio">{data.counts.studyHours}</DetailRow>
                <DetailRow label="Racha actual">
                  {data.counts.streakDays} {data.counts.streakDays === 1 ? "día" : "días"}
                </DetailRow>
                <DetailRow label="Dispositivos con notificaciones">
                  {data.counts.pushDevices}
                </DetailRow>
              </dl>
            </section>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPage() {
  const query = useInfiniteQuery({
    queryKey: usersQueryKey,
    queryFn: ({ pageParam }) => adminApi.users(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  if (query.isPending) return <PageLoading />;
  if (query.isError) return <PageError error={query.error} retry={() => query.refetch()} />;
  const users = query.data.pages.flatMap((page) => page.items);
  return (
    <Page>
      <PageHeader title="Usuarios" description="Consulta, suspende o reactiva cuentas" />
      {users.length === 0 ? (
        <EmptyResult message="No hay cuentas registradas" />
      ) : (
        <DataTable columns={["Cuenta", "Rol", "Estado", "Creada", "Acciones"]}>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-muted-foreground text-sm">{user.email}</span>
                  <code className="text-muted-foreground text-xs">{user.id}</code>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge>{roleLabel(user.role)}</StatusBadge>
              </TableCell>
              <TableCell>
                <StatusBadge tone={user.suspendedAt ? "danger" : "success"}>
                  {user.suspendedAt ? "suspendida" : "activa"}
                </StatusBadge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(user.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="w-12 text-right">
                <UserActions user={user} />
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
