import { zodResolver } from "@hookform/resolvers/zod";
import { adminRoleRemoveSchema, adminRoleUpdateSchema } from "@notesia/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type AdminRole, adminApi } from "@/lib/admin-api";
import { rolesQueryKey, usersQueryKey } from "@/lib/query";

const newRoleSchema = adminRoleUpdateSchema.safeExtend({ userId: z.uuid("UUID inválido.") });
type NewRoleValues = z.infer<typeof newRoleSchema>;
type RoleUpdateValues = z.infer<typeof adminRoleUpdateSchema>;
type RoleRemoveValues = z.infer<typeof adminRoleRemoveSchema>;

function RoleSelect({
  value,
  change,
}: {
  value: "admin" | "support";
  change: (value: "admin" | "support") => void;
}) {
  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="admin">Administrador</SelectItem>
          <SelectItem value="support">Soporte</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function AssignRoleCard() {
  const queryClient = useQueryClient();
  const form = useForm<NewRoleValues>({
    resolver: zodResolver(newRoleSchema),
    defaultValues: {
      userId: "",
      role: "support",
      version: 0,
      confirmation: "" as never,
      password: "",
    },
  });
  const mutation = useMutation({
    mutationFn: ({ userId, ...values }: NewRoleValues) => adminApi.assignRole(userId, values),
    onSuccess: async () => {
      form.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rolesQueryKey }),
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
      ]);
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Asignar un rol</CardTitle>
        <CardDescription>
          Usa versión 0 para una primera asignación. El UUID aparece en la lista de usuarios.
        </CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.userId)}>
              <FieldLabel htmlFor="role-user-id">UUID del usuario</FieldLabel>
              <Input
                id="role-user-id"
                aria-invalid={Boolean(form.formState.errors.userId)}
                {...form.register("userId")}
              />
              <FieldError errors={[form.formState.errors.userId]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.role)}>
              <FieldLabel>Rol</FieldLabel>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => <RoleSelect value={field.value} change={field.onChange} />}
              />
              <FieldError errors={[form.formState.errors.role]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.version)}>
              <FieldLabel htmlFor="new-role-version">Versión actual del rol</FieldLabel>
              <Input
                id="new-role-version"
                type="number"
                min={0}
                aria-invalid={Boolean(form.formState.errors.version)}
                {...form.register("version", { valueAsNumber: true })}
              />
              <FieldError errors={[form.formState.errors.version]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.confirmation)}>
              <FieldLabel htmlFor="assign-confirmation">Escribe ASIGNAR</FieldLabel>
              <Input
                id="assign-confirmation"
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.confirmation)}
                {...form.register("confirmation")}
              />
              <FieldError errors={[form.formState.errors.confirmation]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.password)}>
              <FieldLabel htmlFor="assign-password">Contraseña actual</FieldLabel>
              <Input
                id="assign-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                {...form.register("password")}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>
            <FormMessage error={mutation.error} />
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            Asignar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function ChangeRoleAction({ role }: { role: AdminRole }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<RoleUpdateValues>({
    resolver: zodResolver(adminRoleUpdateSchema),
    defaultValues: {
      role: role.role,
      version: role.version,
      confirmation: "" as never,
      password: "",
    },
  });
  const mutation = useMutation({
    mutationFn: (values: RoleUpdateValues) => adminApi.assignRole(role.userId, values),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rolesQueryKey }),
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
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
            role: role.role,
            version: role.version,
            confirmation: "" as never,
            password: "",
          });
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline">Cambiar</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cambiar rol</AlertDialogTitle>
          <AlertDialogDescription>{role.email}</AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup>
            <Field>
              <FieldLabel>Nuevo rol</FieldLabel>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => <RoleSelect value={field.value} change={field.onChange} />}
              />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.confirmation)}>
              <FieldLabel htmlFor={`change-confirmation-${role.userId}`}>
                Escribe ASIGNAR
              </FieldLabel>
              <Input
                id={`change-confirmation-${role.userId}`}
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.confirmation)}
                {...form.register("confirmation")}
              />
              <FieldError errors={[form.formState.errors.confirmation]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.password)}>
              <FieldLabel htmlFor={`change-password-${role.userId}`}>Contraseña actual</FieldLabel>
              <Input
                id={`change-password-${role.userId}`}
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
              <Button type="submit" disabled={mutation.isPending}>
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

function RemoveRoleAction({ role }: { role: AdminRole }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<RoleRemoveValues>({
    resolver: zodResolver(adminRoleRemoveSchema),
    defaultValues: { version: role.version, confirmation: "" as never, password: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: RoleRemoveValues) => adminApi.removeRole(role.userId, values),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rolesQueryKey }),
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
      ]);
    },
  });
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset({ version: role.version, confirmation: "" as never, password: "" });
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Quitar</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Quitar rol</AlertDialogTitle>
          <AlertDialogDescription>
            {role.email} perderá el acceso asociado al rol. La operación quedará auditada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.confirmation)}>
              <FieldLabel htmlFor={`remove-confirmation-${role.userId}`}>Escribe QUITAR</FieldLabel>
              <Input
                id={`remove-confirmation-${role.userId}`}
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.confirmation)}
                {...form.register("confirmation")}
              />
              <FieldError errors={[form.formState.errors.confirmation]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.password)}>
              <FieldLabel htmlFor={`remove-password-${role.userId}`}>Contraseña actual</FieldLabel>
              <Input
                id={`remove-password-${role.userId}`}
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
              <Button type="submit" variant="destructive" disabled={mutation.isPending}>
                {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                Quitar rol
              </Button>
            </AlertDialogFooter>
          </FieldGroup>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RolesPage() {
  const query = useInfiniteQuery({
    queryKey: rolesQueryKey,
    queryFn: ({ pageParam }) => adminApi.roles(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  if (query.isPending) return <PageLoading />;
  if (query.isError) return <PageError error={query.error} retry={() => query.refetch()} />;
  const roles = query.data.pages.flatMap((page) => page.items);
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1>Roles</h1>
        <p>Administra el acceso administrativo y de soporte.</p>
      </header>
      <AssignRoleCard />
      {roles.length === 0 ? (
        <EmptyResult message="No hay roles asignados." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Versión</TableHead>
              <TableHead>Actualizado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.userId}>
                <TableCell>
                  <div>{role.email}</div>
                  <code>{role.userId}</code>
                </TableCell>
                <TableCell>{role.role}</TableCell>
                <TableCell>{role.version}</TableCell>
                <TableCell>{new Date(role.updatedAt).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <ChangeRoleAction role={role} />
                    <RemoveRoleAction role={role} />
                  </div>
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
