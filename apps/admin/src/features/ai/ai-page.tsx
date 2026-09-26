import { zodResolver } from "@hookform/resolvers/zod";
import {
  adminAiProviderUpdateSchema,
  adminAiRouteUpdateSchema,
  aiProviderSchema,
  aiUseCaseSchema,
} from "@notesia/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CircleHelp, Coins, DollarSign, PlugZap, Route, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { EmptyResult, PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { FormMessage } from "@/components/form-message";
import { Page, PageHeader } from "@/components/page-header";
import { StatCard, StatGrid } from "@/components/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type AdminAiProvider,
  type AdminAiRoute,
  type AdminAiRouteUpdate,
  adminApi,
} from "@/lib/admin-api";
import { aiProvidersQuery, aiRoutesQuery, auditQueryKey, systemHealthQuery } from "@/lib/query";

type Provider = z.infer<typeof aiProviderSchema>;
type UseCase = z.infer<typeof aiUseCaseSchema>;
const providers = aiProviderSchema.options;
const useCases = aiUseCaseSchema.options;

const providerFormSchema = adminAiProviderUpdateSchema.safeExtend({
  confirmation: z.literal("GUARDAR"),
});
type ProviderFormValues = z.infer<typeof providerFormSchema>;

const routeFormSchema = adminAiRouteUpdateSchema.safeExtend({
  useCase: aiUseCaseSchema,
  confirmation: z.literal("GUARDAR"),
});
type RouteFormValues = z.infer<typeof routeFormSchema>;

function BooleanField({
  id,
  checked,
  change,
  title,
  description,
}: {
  id: string;
  checked: boolean;
  change: (checked: boolean) => void;
  title: string;
  description?: string;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => change(value === true)} />
      <FieldContent>
        <FieldLabel htmlFor={id}>
          <FieldTitle>{title}</FieldTitle>
        </FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
    </Field>
  );
}

function ProviderSelect({ value, change }: { value: Provider; change: (value: Provider) => void }) {
  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {providers.map((provider) => (
            <SelectItem key={provider} value={provider}>
              {provider}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ProviderCard({ provider, current }: { provider: Provider; current?: AdminAiProvider }) {
  const queryClient = useQueryClient();
  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: {
      apiKey: "",
      enabled: current?.enabled ?? false,
      password: "",
      confirmation: "" as never,
    },
  });
  const mutation = useMutation({
    mutationFn: ({ confirmation: _confirmation, ...values }: ProviderFormValues) =>
      adminApi.updateAiProvider(provider, {
        ...values,
        apiKey: values.apiKey || undefined,
      }),
    onSuccess: async (result) => {
      form.reset({ apiKey: "", enabled: result.enabled, password: "", confirmation: "" as never });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiProvidersQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: auditQueryKey }),
      ]);
    },
  });
  const submit = (values: ProviderFormValues) => {
    if (!current && !values.apiKey) {
      form.setError("apiKey", { message: "La primera configuración requiere una clave." });
      return;
    }
    mutation.mutate(values);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{provider}</CardTitle>
        <CardDescription>
          {current
            ? "Conexión configurada; la clave guardada nunca se muestra."
            : "Sin conexión configurada."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit(submit)}>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.apiKey)}>
              <FieldLabel htmlFor={`api-key-${provider}`}>Clave nueva</FieldLabel>
              <Input
                id={`api-key-${provider}`}
                type="password"
                autoComplete="new-password"
                placeholder={current ? "Déjalo vacío para conservar la actual" : undefined}
                aria-invalid={Boolean(form.formState.errors.apiKey)}
                {...form.register("apiKey")}
              />
              <FieldError errors={[form.formState.errors.apiKey]} />
            </Field>
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <BooleanField
                  id={`provider-enabled-${provider}`}
                  checked={field.value}
                  change={field.onChange}
                  title="Habilitar proveedor"
                />
              )}
            />
            <Field data-invalid={Boolean(form.formState.errors.confirmation)}>
              <FieldLabel htmlFor={`provider-confirmation-${provider}`}>Escribe GUARDAR</FieldLabel>
              <Input
                id={`provider-confirmation-${provider}`}
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.confirmation)}
                {...form.register("confirmation")}
              />
              <FieldError errors={[form.formState.errors.confirmation]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.password)}>
              <FieldLabel htmlFor={`provider-password-${provider}`}>Contraseña actual</FieldLabel>
              <Input
                id={`provider-password-${provider}`}
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
            Guardar conexión
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function ProvidersPanel() {
  const query = useQuery(aiProvidersQuery);
  if (query.isPending) return <PageLoading />;
  if (query.isError) return <PageError error={query.error} retry={() => query.refetch()} />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {providers.map((provider) => (
        <ProviderCard
          key={provider}
          provider={provider}
          current={query.data.find((item) => item.provider === provider)}
        />
      ))}
    </div>
  );
}

function emptyRoute(): RouteFormValues {
  return {
    useCase: "extract_activity",
    provider: "openai",
    modelId: "",
    timeoutMs: 10_000,
    maxOutputTokens: 512,
    dailyBudgetTokens: 100_000,
    inputPriceUsdPerMillion: "0",
    outputPriceUsdPerMillion: "0",
    alternate: null,
    enabled: false,
    capabilityReviewed: false,
    costReviewed: false,
    privacyReviewed: false,
    password: "",
    confirmation: "" as never,
  };
}

function editRoute(route: AdminAiRoute): RouteFormValues {
  return {
    ...route,
    inputPriceUsdPerMillion: route.inputPriceUsdPerMillion ?? "0",
    outputPriceUsdPerMillion: route.outputPriceUsdPerMillion ?? "0",
    alternate: route.alternate
      ? {
          ...route.alternate,
          inputPriceUsdPerMillion: route.alternate.inputPriceUsdPerMillion ?? "0",
          outputPriceUsdPerMillion: route.alternate.outputPriceUsdPerMillion ?? "0",
        }
      : null,
    capabilityReviewed: false,
    costReviewed: false,
    privacyReviewed: false,
    password: "",
    confirmation: "" as never,
  };
}

function TestRouteAction({ useCase }: { useCase: UseCase }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<{ confirmation: "PROBAR" }>({
    resolver: zodResolver(z.object({ confirmation: z.literal("PROBAR") })),
    defaultValues: { confirmation: "" as never },
  });
  const mutation = useMutation({
    mutationFn: () => adminApi.testAiRoute(useCase),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: auditQueryKey }),
        queryClient.invalidateQueries({ queryKey: systemHealthQuery.queryKey }),
      ]);
    },
  });
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          mutation.reset();
          form.reset({ confirmation: "" as never });
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          Probar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Probar ruta de IA</AlertDialogTitle>
          <AlertDialogDescription>
            La API usará exclusivamente un dato sintético y validará la salida estructurada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isSuccess ? (
          <Alert>
            <AlertTitle>Conexión verificada</AlertTitle>
            <AlertDescription>La ruta respondió con una salida válida.</AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={form.handleSubmit(() => mutation.mutate())}>
            <FieldGroup className="gap-4">
              <Field data-invalid={Boolean(form.formState.errors.confirmation)}>
                <FieldLabel htmlFor={`test-route-${useCase}`}>Escribe PROBAR</FieldLabel>
                <Input
                  id={`test-route-${useCase}`}
                  autoComplete="off"
                  aria-invalid={Boolean(form.formState.errors.confirmation)}
                  {...form.register("confirmation")}
                />
                <FieldError errors={[form.formState.errors.confirmation]} />
              </Field>
              <FormMessage error={mutation.error} />
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                  Ejecutar prueba
                </Button>
              </AlertDialogFooter>
            </FieldGroup>
          </form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RouteEditor({ selected, clear }: { selected: AdminAiRoute | null; clear: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: emptyRoute(),
  });
  useEffect(() => form.reset(selected ? editRoute(selected) : emptyRoute()), [selected, form]);
  const alternate = form.watch("alternate");
  const mutation = useMutation({
    mutationFn: ({ useCase, confirmation: _confirmation, ...values }: RouteFormValues) =>
      adminApi.updateAiRoute(useCase, values as AdminAiRouteUpdate),
    onSuccess: async (saved) => {
      form.reset(editRoute(saved));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiRoutesQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: auditQueryKey }),
      ]);
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{selected ? `Editar ${selected.useCase}` : "Configurar ruta"}</CardTitle>
        <CardDescription>
          Define un modelo concreto, límites, precios y revisiones para un solo caso de uso.
        </CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.useCase)}>
              <FieldLabel>Caso de uso</FieldLabel>
              <Controller
                control={form.control}
                name="useCase"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={Boolean(selected)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {useCases.map((useCase) => (
                          <SelectItem key={useCase} value={useCase}>
                            {useCase}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.useCase]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.provider)}>
              <FieldLabel>Proveedor principal</FieldLabel>
              <Controller
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <ProviderSelect value={field.value} change={field.onChange} />
                )}
              />
              <FieldError errors={[form.formState.errors.provider]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.modelId)}>
              <FieldLabel htmlFor="route-model">ID exacto del modelo</FieldLabel>
              <Input
                id="route-model"
                aria-invalid={Boolean(form.formState.errors.modelId)}
                {...form.register("modelId")}
              />
              <FieldDescription>
                No se aceptan identificadores terminados en latest.
              </FieldDescription>
              <FieldError errors={[form.formState.errors.modelId]} />
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field data-invalid={Boolean(form.formState.errors.timeoutMs)}>
                <FieldLabel htmlFor="route-timeout">Timeout ms</FieldLabel>
                <Input
                  id="route-timeout"
                  type="number"
                  min={1000}
                  max={30000}
                  aria-invalid={Boolean(form.formState.errors.timeoutMs)}
                  {...form.register("timeoutMs", { valueAsNumber: true })}
                />
                <FieldError errors={[form.formState.errors.timeoutMs]} />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.maxOutputTokens)}>
                <FieldLabel htmlFor="route-output">Máximo de salida</FieldLabel>
                <Input
                  id="route-output"
                  type="number"
                  min={64}
                  max={2048}
                  aria-invalid={Boolean(form.formState.errors.maxOutputTokens)}
                  {...form.register("maxOutputTokens", { valueAsNumber: true })}
                />
                <FieldError errors={[form.formState.errors.maxOutputTokens]} />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.dailyBudgetTokens)}>
                <FieldLabel htmlFor="route-budget">Presupuesto diario</FieldLabel>
                <Input
                  id="route-budget"
                  type="number"
                  min={100}
                  max={10000000}
                  aria-invalid={Boolean(form.formState.errors.dailyBudgetTokens)}
                  {...form.register("dailyBudgetTokens", { valueAsNumber: true })}
                />
                <FieldError errors={[form.formState.errors.dailyBudgetTokens]} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={Boolean(form.formState.errors.inputPriceUsdPerMillion)}>
                <FieldLabel htmlFor="route-input-price">USD por millón de entrada</FieldLabel>
                <Input
                  id="route-input-price"
                  inputMode="decimal"
                  aria-invalid={Boolean(form.formState.errors.inputPriceUsdPerMillion)}
                  {...form.register("inputPriceUsdPerMillion")}
                />
                <FieldError errors={[form.formState.errors.inputPriceUsdPerMillion]} />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.outputPriceUsdPerMillion)}>
                <FieldLabel htmlFor="route-output-price">USD por millón de salida</FieldLabel>
                <Input
                  id="route-output-price"
                  inputMode="decimal"
                  aria-invalid={Boolean(form.formState.errors.outputPriceUsdPerMillion)}
                  {...form.register("outputPriceUsdPerMillion")}
                />
                <FieldError errors={[form.formState.errors.outputPriceUsdPerMillion]} />
              </Field>
            </div>
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <BooleanField
                  id="route-enabled"
                  checked={field.value}
                  change={field.onChange}
                  title="Habilitar esta ruta"
                />
              )}
            />
            <BooleanField
              id="alternate-enabled"
              checked={alternate !== null && alternate !== undefined}
              change={(checked) =>
                form.setValue(
                  "alternate",
                  checked
                    ? {
                        provider: form.getValues("provider") === "openai" ? "anthropic" : "openai",
                        modelId: "",
                        timeoutMs: 10_000,
                        maxOutputTokens: 512,
                        inputPriceUsdPerMillion: "0",
                        outputPriceUsdPerMillion: "0",
                      }
                    : null,
                  { shouldValidate: true },
                )
              }
              title="Configurar proveedor alterno"
              description="Se usa solo para fallos controlados del principal."
            />
            {alternate ? (
              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.alternate?.provider)}>
                  <FieldLabel>Proveedor alterno</FieldLabel>
                  <Controller
                    control={form.control}
                    name="alternate.provider"
                    render={({ field }) => (
                      <ProviderSelect value={field.value ?? "openai"} change={field.onChange} />
                    )}
                  />
                  <FieldError errors={[form.formState.errors.alternate?.provider]} />
                </Field>
                <Field data-invalid={Boolean(form.formState.errors.alternate?.modelId)}>
                  <FieldLabel htmlFor="alternate-model">ID exacto del modelo alterno</FieldLabel>
                  <Input
                    id="alternate-model"
                    aria-invalid={Boolean(form.formState.errors.alternate?.modelId)}
                    {...form.register("alternate.modelId")}
                  />
                  <FieldError errors={[form.formState.errors.alternate?.modelId]} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field data-invalid={Boolean(form.formState.errors.alternate?.timeoutMs)}>
                    <FieldLabel htmlFor="alternate-timeout">Timeout ms</FieldLabel>
                    <Input
                      id="alternate-timeout"
                      type="number"
                      min={1000}
                      max={30000}
                      aria-invalid={Boolean(form.formState.errors.alternate?.timeoutMs)}
                      {...form.register("alternate.timeoutMs", { valueAsNumber: true })}
                    />
                    <FieldError errors={[form.formState.errors.alternate?.timeoutMs]} />
                  </Field>
                  <Field data-invalid={Boolean(form.formState.errors.alternate?.maxOutputTokens)}>
                    <FieldLabel htmlFor="alternate-output">Máximo de salida</FieldLabel>
                    <Input
                      id="alternate-output"
                      type="number"
                      min={64}
                      max={2048}
                      aria-invalid={Boolean(form.formState.errors.alternate?.maxOutputTokens)}
                      {...form.register("alternate.maxOutputTokens", { valueAsNumber: true })}
                    />
                    <FieldError errors={[form.formState.errors.alternate?.maxOutputTokens]} />
                  </Field>
                  <Field
                    data-invalid={Boolean(form.formState.errors.alternate?.inputPriceUsdPerMillion)}
                  >
                    <FieldLabel htmlFor="alternate-input-price">USD entrada</FieldLabel>
                    <Input
                      id="alternate-input-price"
                      inputMode="decimal"
                      aria-invalid={Boolean(
                        form.formState.errors.alternate?.inputPriceUsdPerMillion,
                      )}
                      {...form.register("alternate.inputPriceUsdPerMillion")}
                    />
                    <FieldError
                      errors={[form.formState.errors.alternate?.inputPriceUsdPerMillion]}
                    />
                  </Field>
                  <Field
                    data-invalid={Boolean(
                      form.formState.errors.alternate?.outputPriceUsdPerMillion,
                    )}
                  >
                    <FieldLabel htmlFor="alternate-output-price">USD salida</FieldLabel>
                    <Input
                      id="alternate-output-price"
                      inputMode="decimal"
                      aria-invalid={Boolean(
                        form.formState.errors.alternate?.outputPriceUsdPerMillion,
                      )}
                      {...form.register("alternate.outputPriceUsdPerMillion")}
                    />
                    <FieldError
                      errors={[form.formState.errors.alternate?.outputPriceUsdPerMillion]}
                    />
                  </Field>
                </div>
              </FieldGroup>
            ) : null}
            <Controller
              control={form.control}
              name="capabilityReviewed"
              render={({ field }) => (
                <BooleanField
                  id="capability-reviewed"
                  checked={field.value}
                  change={field.onChange}
                  title="Capacidad revisada"
                />
              )}
            />
            <Controller
              control={form.control}
              name="costReviewed"
              render={({ field }) => (
                <BooleanField
                  id="cost-reviewed"
                  checked={field.value}
                  change={field.onChange}
                  title="Coste revisado"
                />
              )}
            />
            <Controller
              control={form.control}
              name="privacyReviewed"
              render={({ field }) => (
                <BooleanField
                  id="privacy-reviewed"
                  checked={field.value}
                  change={field.onChange}
                  title="Privacidad revisada"
                />
              )}
            />
            <Field data-invalid={Boolean(form.formState.errors.confirmation)}>
              <FieldLabel htmlFor="route-confirmation">Escribe GUARDAR</FieldLabel>
              <Input
                id="route-confirmation"
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.confirmation)}
                {...form.register("confirmation")}
              />
              <FieldError errors={[form.formState.errors.confirmation]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.password)}>
              <FieldLabel htmlFor="route-password">Contraseña actual</FieldLabel>
              <Input
                id="route-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                {...form.register("password")}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>
            <FieldError errors={[form.formState.errors.root]} />
            <FormMessage error={mutation.error} />
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            Guardar ruta
          </Button>
          {selected ? (
            <Button type="button" variant="outline" onClick={clear}>
              Nueva ruta
            </Button>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  );
}

function RoutesPanel() {
  const query = useQuery(aiRoutesQuery);
  const [selected, setSelected] = useState<AdminAiRoute | null>(null);
  if (query.isPending) return <PageLoading />;
  if (query.isError) return <PageError error={query.error} retry={() => query.refetch()} />;
  return (
    <div className="flex flex-col gap-4">
      <RouteEditor selected={selected} clear={() => setSelected(null)} />
      {query.data.length === 0 ? (
        <EmptyResult message="No hay rutas configuradas." />
      ) : (
        <DataTable columns={["Caso", "Principal", "Alterno", "Estado", "Acciones"]}>
          {query.data.map((route) => (
            <TableRow key={route.useCase}>
              <TableCell className="font-medium">{route.useCase}</TableCell>
              <TableCell>
                {route.provider} / <code className="text-xs">{route.modelId}</code>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {route.alternate ? (
                  <>
                    {route.alternate.provider} /{" "}
                    <code className="text-xs">{route.alternate.modelId}</code>
                  </>
                ) : (
                  "sin alterno"
                )}
              </TableCell>
              <TableCell>
                <Badge variant={route.enabled ? "secondary" : "outline"}>
                  {route.enabled ? "habilitada" : "deshabilitada"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelected(route)}>
                    Editar
                  </Button>
                  <TestRouteAction useCase={route.useCase} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
    </div>
  );
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

const today = new Date();
const initialFrom = new Date(today);
initialFrom.setUTCDate(initialFrom.getUTCDate() - 7);
const initialThrough = new Date(today);
initialThrough.setUTCDate(initialThrough.getUTCDate() + 1);
const usageRangeSchema = z
  .object({ from: z.iso.date(), through: z.iso.date() })
  .refine(({ from, through }) => from < through, {
    message: "La fecha final debe ser posterior.",
    path: ["through"],
  });
type UsageRange = z.infer<typeof usageRangeSchema>;

type AiUsage = Awaited<ReturnType<typeof adminApi.aiUsage>>;

/** Suma importes con nueve decimales fijos sin pasar por coma flotante. */
function sumUsd(values: string[]) {
  const total = values.reduce((sum, value) => sum + BigInt(value.replace(".", "")), 0n);
  const text = total.toString().padStart(10, "0");
  return `${text.slice(0, -9)}.${text.slice(-9)}`;
}

function UsageSummary({ usage }: { usage: AiUsage }) {
  const requests = usage.items.reduce((sum, item) => sum + item.requests, 0);
  const tokens = usage.items.reduce((sum, item) => sum + item.inputTokens + item.outputTokens, 0);
  const fallbacks = usage.fallbacks.reduce((sum, item) => sum + item.requests, 0);
  return (
    <StatGrid>
      <StatCard
        icon={Activity}
        label="Solicitudes"
        value={requests}
        footer="En el rango consultado."
      />
      <StatCard icon={Coins} label="Tokens" value={tokens} footer="Entrada más salida." />
      <StatCard
        icon={DollarSign}
        label="Coste conocido"
        value={`USD ${sumUsd(usage.items.map((item) => item.knownCostUsd))}`}
        footer="Solo solicitudes con precio configurado."
      />
      <StatCard
        icon={Shuffle}
        label="Fallbacks"
        value={fallbacks}
        footer="Solicitudes resueltas por el proveedor alterno."
      />
    </StatGrid>
  );
}

function AiOverview() {
  const health = useQuery(systemHealthQuery);
  const providersQuery = useQuery(aiProvidersQuery);
  const routes = useQuery(aiRoutesQuery);
  const enabledProviders = providersQuery.data?.filter((item) => item.enabled).length;
  const enabledRoutes = routes.data?.filter((item) => item.enabled).length;
  const pending = <Skeleton className="h-8 w-20" />;
  return (
    <StatGrid>
      <StatCard
        icon={DollarSign}
        label={
          health.data ? `Coste, últimos ${health.data.ai.windowMinutes} minutos` : "Coste reciente"
        }
        value={health.data ? `USD ${health.data.ai.knownCostUsd}` : pending}
        footer="Coste conocido de la ventana de salud."
      />
      <StatCard
        icon={CircleHelp}
        label="Sin coste calculado"
        value={health.data ? health.data.ai.uncostedRequests : pending}
        footer="Solicitudes sin precio configurado."
      />
      <StatCard
        icon={PlugZap}
        label="Proveedores habilitados"
        value={
          enabledProviders === undefined ? pending : `${enabledProviders} de ${providers.length}`
        }
        footer="Conexiones activas con clave guardada."
      />
      <StatCard
        icon={Route}
        label="Rutas habilitadas"
        value={
          enabledRoutes === undefined || !routes.data
            ? pending
            : `${enabledRoutes} de ${routes.data.length}`
        }
        footer="Casos de uso con modelo activo."
      />
    </StatGrid>
  );
}

function UsagePanel() {
  const [range, setRange] = useState<UsageRange>({
    from: isoDate(initialFrom),
    through: isoDate(initialThrough),
  });
  const form = useForm<UsageRange>({ resolver: zodResolver(usageRangeSchema), values: range });
  const query = useQuery({
    queryKey: ["admin", "ai", "usage", range],
    queryFn: () => adminApi.aiUsage(range.from, range.through),
    retry: false,
  });
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Rango de uso</CardTitle>
          <CardDescription>
            La fecha final es exclusiva y el máximo permitido es 31 días.
          </CardDescription>
        </CardHeader>
        <form onSubmit={form.handleSubmit(setRange)}>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(form.formState.errors.from)}>
                <FieldLabel htmlFor="usage-from">Desde</FieldLabel>
                <Input
                  id="usage-from"
                  type="date"
                  aria-invalid={Boolean(form.formState.errors.from)}
                  {...form.register("from")}
                />
                <FieldError errors={[form.formState.errors.from]} />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.through)}>
                <FieldLabel htmlFor="usage-through">Hasta, sin incluir</FieldLabel>
                <Input
                  id="usage-through"
                  type="date"
                  aria-invalid={Boolean(form.formState.errors.through)}
                  {...form.register("through")}
                />
                <FieldError errors={[form.formState.errors.through]} />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button type="submit">Consultar</Button>
          </CardFooter>
        </form>
      </Card>
      {query.isPending ? <PageLoading /> : null}
      {query.isError ? <PageError error={query.error} retry={() => query.refetch()} /> : null}
      {query.data ? (
        <>
          <UsageSummary usage={query.data} />
          {query.data.items.length === 0 ? (
            <EmptyResult message="No hay consumo en el rango." />
          ) : (
            <DataTable
              columns={[
                "Caso",
                "Proveedor",
                "Estado",
                "Solicitudes",
                "Tokens",
                "Coste USD",
                "p95 ms",
              ]}
            >
              {query.data.items.map((item) => (
                <TableRow key={`${item.useCase}-${item.provider}-${item.status}`}>
                  <TableCell className="font-medium">{item.useCase}</TableCell>
                  <TableCell>{item.provider}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.status}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{item.requests}</TableCell>
                  <TableCell className="tabular-nums">
                    {item.inputTokens + item.outputTokens}
                  </TableCell>
                  <TableCell>{item.totalCostUsd ?? `${item.knownCostUsd} conocido`}</TableCell>
                  <TableCell>{item.p95DurationMs ?? "sin dato"}</TableCell>
                </TableRow>
              ))}
            </DataTable>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Fallbacks y transiciones</CardTitle>
              <CardDescription>
                Motivos agregados; no contienen contenido de usuarios.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {query.data.fallbacks.length + query.data.transitions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Sin fallbacks ni transiciones en el rango.
                </p>
              ) : null}
              <ul className="flex flex-col gap-1 text-sm">
                {query.data.fallbacks.map((item) => (
                  <li key={`${item.useCase}-${item.reason}`}>
                    {item.useCase}: {item.reason} ({item.requests})
                  </li>
                ))}
                {query.data.transitions.map((item) => (
                  <li
                    key={`${item.useCase}-${item.fromProvider}-${item.toProvider}-${item.reason}`}
                  >
                    {item.useCase}: {item.fromProvider} → {item.toProvider}, {item.reason} (
                    {item.requests})
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export function AiPage() {
  return (
    <Page>
      <PageHeader
        title="Configuración de IA"
        description="Conexiones, modelos por caso de uso, prueba sintética y consumo."
      />
      <AiOverview />
      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Proveedores</TabsTrigger>
          <TabsTrigger value="routes">Rutas</TabsTrigger>
          <TabsTrigger value="usage">Uso</TabsTrigger>
        </TabsList>
        <TabsContent value="providers">
          <ProvidersPanel />
        </TabsContent>
        <TabsContent value="routes">
          <RoutesPanel />
        </TabsContent>
        <TabsContent value="usage">
          <UsagePanel />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
