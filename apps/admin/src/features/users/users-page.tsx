import { zodResolver } from "@hookform/resolvers/zod";
import { adminUserSuspensionSchema } from "@notesia/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { EmptyResult, PageError, PageLoading } from "@/components/async-state";
import { FormMessage } from "@/components/form-message";
import { LoadMore } from "@/components/load-more";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type AdminUser, adminApi } from "@/lib/admin-api";
import { rolesQueryKey, usersQueryKey } from "@/lib/query";

type SuspensionValues = z.infer<typeof adminUserSuspensionSchema>;

function SuspensionAction({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const suspended = user.suspendedAt === null;
  const confirmation = suspended ? "SUSPENDER" : "REACTIVAR";
  const form = useForm<SuspensionValues>({
    resolver: zodResolver(adminUserSuspensionSchema),
    defaultValues: {
      suspended,
      version: user.version,
      confirmation: "" as never,
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
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next)
          form.reset({
            suspended,
            version: user.version,
            confirmation: "" as never,
            password: "",
          });
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant={suspended ? "destructive" : "outline"}>{confirmation}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation} cuenta</AlertDialogTitle>
          <AlertDialogDescription>
            Confirma el cambio para {user.email}. La operación quedará auditada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.confirmation)}>
              <FieldLabel htmlFor={`confirmation-${user.id}`}>Escribe {confirmation}</FieldLabel>
              <Input
                id={`confirmation-${user.id}`}
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.confirmation)}
                {...form.register("confirmation")}
              />
              <FieldError errors={[form.formState.errors.confirmation]} />
            </Field>
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
            <FormMessage error={mutation.error} />
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
    <section className="flex flex-col gap-4">
      <header>
        <h1>Usuarios</h1>
        <p>Consulta, suspende o reactiva cuentas.</p>
      </header>
      {users.length === 0 ? (
        <EmptyResult message="No hay cuentas registradas." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead>Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div>{user.name}</div>
                  <div>{user.email}</div>
                  <code>{user.id}</code>
                </TableCell>
                <TableCell>{user.role ?? "estudiante"}</TableCell>
                <TableCell>
                  <Badge variant={user.suspendedAt ? "destructive" : "secondary"}>
                    {user.suspendedAt ? "suspendida" : "activa"}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(user.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  <SuspensionAction user={user} />
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
