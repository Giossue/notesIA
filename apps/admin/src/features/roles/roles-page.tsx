import { zodResolver } from "@hookform/resolvers/zod";
import { adminRoleRemoveSchema, adminRoleUpdateSchema } from "@notesia/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
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
import { type AdminRole, adminApi } from "@/lib/admin-api";
import { roleLabel } from "@/lib/labels";
import { rolesQueryKey, usersQueryKey } from "@/lib/query";

const newRoleSchema = adminRoleUpdateSchema.safeExtend({ userId: z.uuid("Elige una cuenta") });
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

function AssignRoleDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  // Cuentas que todavía no tienen rol; se cargan todas al abrir el diálogo.
  const users = useInfiniteQuery({
    queryKey: usersQueryKey,
    queryFn: ({ pageParam }) => adminApi.users(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: open,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = users;
  useEffect(() => {
    if (open && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage]);
  const candidates = (users.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (user) => user.role === null && user.suspendedAt === null,
  );
  const form = useForm<NewRoleValues>({
    resolver: zodResolver(newRoleSchema),
    defaultValues: {
      userId: "",
      role: "support",
      version: 0,
      confirmation: "ASIGNAR",
      password: "",
    },
  });
  const mutation = useMutation({
    mutationFn: ({ userId, ...values }: NewRoleValues) => adminApi.assignRole(userId, values),
    onSuccess: async () => {
      form.reset();
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rolesQueryKey }),
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
      ]);
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
          <UserPlus data-icon="inline-start" />
          Asignar rol
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar un rol</DialogTitle>
          <DialogDescription>Elige la cuenta y el rol que tendrá en el panel</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(form.formState.errors.userId)}>
              <FieldLabel>Cuenta</FieldLabel>
              <Controller
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      className="w-full"
                      aria-invalid={Boolean(form.formState.errors.userId)}
                    >
                      <SelectValue
                        placeholder={users.isPending ? "Cargando cuentas…" : "Elige una cuenta"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {candidates.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name} · {user.email}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
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
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                Asignar
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangeRoleDialog({
  role,
  open,
  setOpen,
}: {
  role: AdminRole;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<RoleUpdateValues>({
    resolver: zodResolver(adminRoleUpdateSchema),
    defaultValues: {
      role: role.role,
      version: role.version,
      confirmation: "ASIGNAR",
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
  // Al abrir desde el menú, el formulario parte de los datos actuales de la fila.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al abrir
  useEffect(() => {
    if (!open) return;
    form.reset({
      role: role.role,
      version: role.version,
      confirmation: "ASIGNAR",
      password: "",
    });
  }, [open]);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cambiar rol</AlertDialogTitle>
          <AlertDialogDescription>{role.email}</AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel>Nuevo rol</FieldLabel>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => <RoleSelect value={field.value} change={field.onChange} />}
              />
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

function RemoveRoleDialog({
  role,
  open,
  setOpen,
}: {
  role: AdminRole;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<RoleRemoveValues>({
    resolver: zodResolver(adminRoleRemoveSchema),
    defaultValues: { version: role.version, confirmation: "QUITAR", password: "" },
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
  // Al abrir desde el menú, el formulario parte de los datos actuales de la fila.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al abrir
  useEffect(() => {
    if (!open) return;
    form.reset({ version: role.version, confirmation: "QUITAR", password: "" });
  }, [open]);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Quitar rol</AlertDialogTitle>
          <AlertDialogDescription>
            {role.email} perderá el acceso asociado al rol. La operación quedará auditada
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup className="gap-4">
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

function RoleActions({ role }: { role: AdminRole }) {
  const [open, setOpen] = useState<"change" | "remove" | null>(null);
  const toggle = (dialog: "change" | "remove") => (next: boolean) => setOpen(next ? dialog : null);
  return (
    <RowActions
      actions={[
        { label: "Cambiar rol", select: () => setOpen("change") },
        { label: "Quitar rol", destructive: true, select: () => setOpen("remove") },
      ]}
    >
      <ChangeRoleDialog role={role} open={open === "change"} setOpen={toggle("change")} />
      <RemoveRoleDialog role={role} open={open === "remove"} setOpen={toggle("remove")} />
    </RowActions>
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
    <Page>
      <PageHeader
        title="Roles"
        description="Administra el acceso administrativo y de soporte"
        actions={<AssignRoleDialog />}
      />
      {roles.length === 0 ? (
        <EmptyResult message="No hay roles asignados" />
      ) : (
        <DataTable columns={["Cuenta", "Rol", "Actualizado", "Acciones"]}>
          {roles.map((role) => (
            <TableRow key={role.userId}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{role.email}</span>
                  <code className="text-muted-foreground text-xs">{role.userId}</code>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge>{roleLabel(role.role)}</StatusBadge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(role.updatedAt).toLocaleString()}
              </TableCell>
              <TableCell className="w-12 text-right">
                <RoleActions role={role} />
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
