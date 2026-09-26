import { zodResolver } from "@hookform/resolvers/zod";
import { adminUserSuspensionSchema } from "@notesia/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { type AdminUser, adminApi } from "@/lib/admin-api";
import { rolesQueryKey, usersQueryKey } from "@/lib/query";

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
    onSuccess: async () => {
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
  const suspended = user.suspendedAt === null;
  return (
    <RowActions
      actions={[
        {
          label: suspended ? "Suspender" : "Reactivar",
          destructive: suspended,
          select: () => setOpen(true),
        },
      ]}
    >
      <SuspensionDialog user={user} open={open} setOpen={setOpen} />
    </RowActions>
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
                <StatusBadge>{user.role ?? "estudiante"}</StatusBadge>
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
