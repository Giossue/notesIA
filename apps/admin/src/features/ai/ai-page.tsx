import { zodResolver } from "@hookform/resolvers/zod";
import { adminAiProviderUpdateSchema, aiProviderSchema } from "@notesia/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CircleHelp, Coins, DollarSign, PlugZap, Route } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { EmptyResult, PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { Page, PageHeader } from "@/components/page-header";
import { StatCard, StatGrid } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { type AdminAiProvider, type AdminAiRoute, adminApi } from "@/lib/admin-api";
import { providerLabels, usageStatusLabels, useCaseLabels } from "@/lib/labels";
import { aiProvidersQuery, aiRoutesQuery, auditQueryKey, systemHealthQuery } from "@/lib/query";
import { SuggestionsPanel } from "./suggestions-panel";

type Provider = z.infer<typeof aiProviderSchema>;
const providers = aiProviderSchema.options;

const providerFormSchema = adminAiProviderUpdateSchema.safeExtend({
  confirmation: z.literal("GUARDAR"),
});
type ProviderFormValues = z.infer<typeof providerFormSchema>;

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

function ProviderCard({ provider, current }: { provider: Provider; current?: AdminAiProvider }) {
  const queryClient = useQueryClient();
  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: {
      apiKey: "",
      enabled: current?.enabled ?? false,
      confirmation: "GUARDAR",
    },
  });
  const mutation = useMutation({
    mutationFn: ({ confirmation: _confirmation, ...values }: ProviderFormValues) =>
      adminApi.updateAiProvider(provider, {
        ...values,
        apiKey: values.apiKey || undefined,
      }),
    onSuccess: async (result) => {
      toast.success(
        `${providerLabels[provider]} ${result.enabled ? "guardado y activo" : "guardado, sin usar"}`,
      );
      form.reset({ apiKey: "", enabled: result.enabled, confirmation: "GUARDAR" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiProvidersQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: auditQueryKey }),
      ]);
    },
  });
  const submit = (values: ProviderFormValues) => {
    if (!current && !values.apiKey) {
      form.setError("apiKey", { message: "Escribe la API key del proveedor." });
      return;
    }
    mutation.mutate(values);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{providerLabels[provider]}</CardTitle>
        <CardDescription>
          {!current
            ? "Sin conexión configurada"
            : current.enabled
              ? "Activo · la API key guardada nunca se muestra"
              : "API key guardada, sin usar"}
        </CardDescription>
      </CardHeader>
      <form className="flex flex-col gap-(--card-spacing)" onSubmit={form.handleSubmit(submit)}>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.apiKey)}>
              <FieldLabel htmlFor={`api-key-${provider}`}>API key</FieldLabel>
              <Input
                id={`api-key-${provider}`}
                type="password"
                autoComplete="new-password"
                placeholder={
                  current
                    ? "Déjala vacía para conservar la actual"
                    : "Pega la API key del proveedor"
                }
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
                  title="Proveedor activo"
                  description="Los usos de IA de la app solo pueden elegir proveedores activos"
                />
              )}
            />
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

/** Modelos sugeridos para el asistente, con su precio por millón de tokens (USD). */
const assistantModels: Record<
  Provider,
  Array<{ id: string; name: string; hint: string; input: string; output: string }>
> = {
  anthropic: [
    {
      id: "claude-haiku-4-5",
      name: "Claude Haiku 4.5",
      hint: "Rápido y económico · recomendado",
      input: "1",
      output: "5",
    },
    {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      hint: "Más preciso, algo más lento",
      input: "2",
      output: "10",
    },
  ],
  openai: [],
  // Precio de horario pico (el valle cuesta la mitad): el tope diario queda del lado seguro.
  deepseek: [
    {
      id: "deepseek-flash",
      name: "DeepSeek Flash",
      hint: "Muy económico · recomendado para la configuración inicial",
      input: "0.30",
      output: "1.20",
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      hint: "Más preciso, más caro",
      input: "1.32",
      output: "3.96",
    },
  ],
};
const CUSTOM_MODEL = "custom";
// Valores fijos: cada mensaje puede usar dos llamadas cortas a la IA.
const ASSISTANT_TIMEOUT_MS = 30_000;
const ASSISTANT_MAX_OUTPUT_TOKENS = 2048;

const assistantFormSchema = z
  .object({
    provider: aiProviderSchema,
    model: z.string().min(1, "Elige un modelo"),
    customModelId: z.string(),
    inputPrice: z.string(),
    outputPrice: z.string(),
    dailyBudgetUsd: z
      .string()
      .regex(/^\d+(?:\.\d{1,2})?$/, "Escribe un monto en dólares, por ejemplo 2 o 2.50"),
    enabled: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.model !== CUSTOM_MODEL) return;
    if (!/^[A-Za-z0-9._:/-]{3,120}$/.test(value.customModelId.trim()))
      context.addIssue({
        code: "custom",
        path: ["customModelId"],
        message: "Escribe el ID del modelo",
      });
    for (const key of ["inputPrice", "outputPrice"] as const)
      if (!/^\d+(?:\.\d{1,6})?$/.test(value[key]) || Number(value[key]) <= 0)
        context.addIssue({ code: "custom", path: [key], message: "Escribe el precio en dólares" });
  });
type AssistantFormValues = z.infer<typeof assistantFormSchema>;

/** Precio que usa el tope diario: el mayor de entrada y salida, para no pasarse. */
const topPrice = (input: string, output: string) =>
  Math.max(Number(input), Number(output), 0.000001);

function assistantDefaults(route: AdminAiRoute | undefined, active: Provider): AssistantFormValues {
  // Si el asistente estaba con otro proveedor, se parte del primer modelo del activo.
  if (!route || route.provider !== active)
    return {
      provider: active,
      model: assistantModels[active][0]?.id ?? CUSTOM_MODEL,
      customModelId: "",
      inputPrice: "",
      outputPrice: "",
      dailyBudgetUsd: "2",
      enabled: true,
    };
  const known = assistantModels[route.provider].find((item) => item.id === route.modelId);
  const input = route.inputPriceUsdPerMillion ?? known?.input ?? "0";
  const output = route.outputPriceUsdPerMillion ?? known?.output ?? "0";
  return {
    provider: route.provider,
    model: known ? known.id : CUSTOM_MODEL,
    customModelId: known ? "" : route.modelId,
    inputPrice: known ? "" : input,
    outputPrice: known ? "" : output,
    dailyBudgetUsd: ((route.dailyBudgetTokens * topPrice(input, output)) / 1_000_000)
      .toFixed(2)
      .replace(/\.00$/, ""),
    enabled: route.enabled,
  };
}

type RouteUseCase = "assistant_chat" | "onboarding_setup";
const routeCopy: Record<
  RouteUseCase,
  { title: string; description: string; preferred: Provider; enable: string }
> = {
  assistant_chat: {
    title: "Asistente de IA",
    description:
      "El chat de la app donde los estudiantes escriben o hablan para organizar sus tareas",
    preferred: "anthropic",
    enable: "Activar asistente",
  },
  onboarding_setup: {
    title: "Configuración inicial",
    description:
      "Al registrarse, el estudiante cuenta su semana por voz o texto y el agente arma su horario y compromisos",
    preferred: "deepseek",
    enable: "Activar configuración conversada",
  },
};

function RoutePanel({ useCase }: { useCase: RouteUseCase }) {
  const routes = useQuery(aiRoutesQuery);
  const providersQuery = useQuery(aiProvidersQuery);
  if (routes.isPending || providersQuery.isPending) return <PageLoading />;
  if (routes.isError) return <PageError error={routes.error} retry={() => routes.refetch()} />;
  if (providersQuery.isError)
    return <PageError error={providersQuery.error} retry={() => providersQuery.refetch()} />;
  const route = routes.data.find((item) => item.useCase === useCase);
  const enabled = providersQuery.data.filter((item) => item.enabled).map((item) => item.provider);
  if (enabled.length === 0)
    return (
      <Alert>
        <AlertTitle>No hay proveedores activos</AlertTitle>
        <AlertDescription>
          En la pestaña Proveedores guarda una API key y marca «Proveedor activo»
        </AlertDescription>
      </Alert>
    );
  const preferred = routeCopy[useCase].preferred;
  const fallback = enabled.includes(preferred) ? preferred : (enabled[0] as Provider);
  return (
    <AssistantEditor
      key={`${enabled.join("-")}-${route?.provider ?? "new"}-${route?.modelId ?? ""}`}
      useCase={useCase}
      route={route}
      active={route && enabled.includes(route.provider) ? route.provider : fallback}
      enabled={enabled}
    />
  );
}

function AssistantEditor({
  useCase,
  route,
  active,
  enabled,
}: {
  useCase: RouteUseCase;
  route?: AdminAiRoute;
  active: Provider;
  enabled: Provider[];
}) {
  const copy = routeCopy[useCase];
  const queryClient = useQueryClient();
  const form = useForm<AssistantFormValues>({
    resolver: zodResolver(assistantFormSchema),
    defaultValues: assistantDefaults(route, active),
  });
  const provider = form.watch("provider");
  const model = form.watch("model");
  const options = assistantModels[provider];
  const save = useMutation({
    mutationFn: (values: AssistantFormValues) => {
      const known = options.find((item) => item.id === values.model);
      const input = known ? known.input : values.inputPrice;
      const output = known ? known.output : values.outputPrice;
      const tokens = Math.round(
        (Number(values.dailyBudgetUsd) * 1_000_000) / topPrice(input, output),
      );
      return adminApi.updateAiRoute(useCase, {
        provider: values.provider,
        modelId: known ? known.id : values.customModelId.trim(),
        timeoutMs: ASSISTANT_TIMEOUT_MS,
        maxOutputTokens: ASSISTANT_MAX_OUTPUT_TOKENS,
        dailyBudgetTokens: Math.min(10_000_000, Math.max(100, tokens)),
        inputPriceUsdPerMillion: input,
        outputPriceUsdPerMillion: output,
        alternate: null,
        enabled: values.enabled,
      });
    },
    onSuccess: async () => {
      toast.success(`${copy.title}: cambios guardados`);
      test.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiRoutesQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: auditQueryKey }),
      ]);
    },
  });
  const test = useMutation({
    mutationFn: () => adminApi.testAiRoute(useCase),
    onSuccess: () => toast.success("La IA respondió bien: la conexión y el modelo funcionan"),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: auditQueryKey }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <form
        className="flex flex-col gap-(--card-spacing)"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <CardContent>
          <FieldGroup>
            {route && route.provider !== active && (
              <Alert>
                <AlertTitle>Usaba {providerLabels[route.provider]}, que no está activo</AlertTitle>
                <AlertDescription>
                  Elige un proveedor activo y un modelo, y guarda para que vuelva a funcionar
                </AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor={`${useCase}-provider`}>Proveedor</FieldLabel>
              <Controller
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      const next = value as Provider;
                      field.onChange(next);
                      form.setValue("model", assistantModels[next][0]?.id ?? CUSTOM_MODEL);
                    }}
                  >
                    <SelectTrigger id={`${useCase}-provider`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {enabled.map((item) => (
                          <SelectItem key={item} value={item}>
                            {providerLabels[item]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>Solo aparecen los proveedores activos</FieldDescription>
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.model)}>
              <FieldLabel htmlFor={`${useCase}-model`}>Modelo</FieldLabel>
              <Controller
                control={form.control}
                name="model"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={`${useCase}-model`} className="w-full">
                      <SelectValue placeholder="Elige un modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {options.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} · {item.hint}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_MODEL}>Otro modelo</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.model]} />
            </Field>
            {model === CUSTOM_MODEL && (
              <>
                <Field data-invalid={Boolean(form.formState.errors.customModelId)}>
                  <FieldLabel htmlFor={`${useCase}-model-id`}>ID del modelo</FieldLabel>
                  <Input
                    id={`${useCase}-model-id`}
                    placeholder="Tal como lo indica el proveedor"
                    aria-invalid={Boolean(form.formState.errors.customModelId)}
                    {...form.register("customModelId")}
                  />
                  <FieldError errors={[form.formState.errors.customModelId]} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={Boolean(form.formState.errors.inputPrice)}>
                    <FieldLabel htmlFor={`${useCase}-input-price`}>
                      Precio de entrada (USD por millón de tokens)
                    </FieldLabel>
                    <Input
                      id={`${useCase}-input-price`}
                      inputMode="decimal"
                      {...form.register("inputPrice")}
                    />
                    <FieldError errors={[form.formState.errors.inputPrice]} />
                  </Field>
                  <Field data-invalid={Boolean(form.formState.errors.outputPrice)}>
                    <FieldLabel htmlFor={`${useCase}-output-price`}>
                      Precio de salida (USD por millón de tokens)
                    </FieldLabel>
                    <Input
                      id={`${useCase}-output-price`}
                      inputMode="decimal"
                      {...form.register("outputPrice")}
                    />
                    <FieldError errors={[form.formState.errors.outputPrice]} />
                  </Field>
                </div>
              </>
            )}
            <Field data-invalid={Boolean(form.formState.errors.dailyBudgetUsd)}>
              <FieldLabel htmlFor={`${useCase}-budget`}>Límite de gasto diario (USD)</FieldLabel>
              <Input
                id={`${useCase}-budget`}
                inputMode="decimal"
                aria-invalid={Boolean(form.formState.errors.dailyBudgetUsd)}
                {...form.register("dailyBudgetUsd")}
              />
              <FieldDescription>
                Al llegar al límite se pausa hasta el día siguiente
              </FieldDescription>
              <FieldError errors={[form.formState.errors.dailyBudgetUsd]} />
            </Field>
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <BooleanField
                  id={`${useCase}-enabled`}
                  checked={field.value}
                  change={field.onChange}
                  title={copy.enable}
                  description="Desactívalo para que la app deje de usar la IA aquí"
                />
              )}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : null}
            Guardar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!route || test.isPending || form.formState.isDirty}
            onClick={() => test.mutate()}
          >
            {test.isPending ? <Spinner data-icon="inline-start" /> : null}
            Probar
          </Button>
        </CardFooter>
      </form>
    </Card>
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

/** "USD 1.25"; montos que no llegan a un centavo se muestran como "< USD 0.01". */
function formatUsd(value: string) {
  const amount = Number(value);
  if (amount > 0 && amount < 0.01) return "< USD 0.01";
  return `USD ${amount.toFixed(2)}`;
}

function UsageSummary({ usage }: { usage: AiUsage }) {
  const requests = usage.items.reduce((sum, item) => sum + item.requests, 0);
  const tokens = usage.items.reduce((sum, item) => sum + item.inputTokens + item.outputTokens, 0);
  const fallbacks = usage.fallbacks.reduce((sum, item) => sum + item.requests, 0);
  return (
    <StatGrid>
      <StatCard
        icon={Activity}
        label="Consultas a la IA"
        value={requests}
        footer="Cada mensaje del chat usa una o dos"
      />
      <StatCard icon={Coins} label="Tokens" value={tokens} footer="Texto enviado y recibido" />
      <StatCard
        icon={DollarSign}
        label="Gasto"
        value={formatUsd(sumUsd(usage.items.map((item) => item.knownCostUsd)))}
        footer="En el rango consultado"
      />
      <StatCard
        icon={CircleHelp}
        label="Sin respuesta"
        value={fallbacks}
        footer="Sin créditos, límite diario alcanzado o proveedor caído"
      />
    </StatGrid>
  );
}

function AiOverview() {
  const health = useQuery(systemHealthQuery);
  const providersQuery = useQuery(aiProvidersQuery);
  const routes = useQuery(aiRoutesQuery);
  const active = providersQuery.data?.filter((item) => item.enabled) ?? [];
  const assistant = routes.data?.find((item) => item.useCase === "assistant_chat");
  const dailyLimit = assistant
    ? (assistant.dailyBudgetTokens *
        topPrice(
          assistant.inputPriceUsdPerMillion ?? "0",
          assistant.outputPriceUsdPerMillion ?? "0",
        )) /
      1_000_000
    : null;
  const pending = <Skeleton className="h-8 w-20" />;
  return (
    <StatGrid>
      <StatCard
        icon={Route}
        label="Asistente"
        value={!routes.data ? pending : assistant?.enabled ? "Activo" : "Inactivo"}
        footer={assistant ? assistant.modelId : "Sin configurar"}
      />
      <StatCard
        icon={PlugZap}
        label="Proveedores activos"
        value={
          !providersQuery.data
            ? pending
            : active.length > 0
              ? active.map((item) => providerLabels[item.provider]).join(", ")
              : "Ninguno"
        }
        footer="Se cambia en la pestaña Proveedores"
      />
      <StatCard
        icon={DollarSign}
        label={
          health.data ? `Gasto, últimos ${health.data.ai.windowMinutes} minutos` : "Gasto reciente"
        }
        value={health.data ? formatUsd(health.data.ai.knownCostUsd) : pending}
        footer="Según el precio del modelo"
      />
      <StatCard
        icon={Coins}
        label="Límite diario"
        value={!routes.data ? pending : dailyLimit === null ? "—" : formatUsd(String(dailyLimit))}
        footer="Al alcanzarlo, el asistente se pausa hasta mañana"
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
            La fecha final es exclusiva y el máximo permitido es 31 días
          </CardDescription>
        </CardHeader>
        <form className="flex flex-col gap-(--card-spacing)" onSubmit={form.handleSubmit(setRange)}>
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
            <EmptyResult message="No hay consumo en el rango" />
          ) : (
            <DataTable
              columns={[
                "Caso de uso",
                "Proveedor",
                "Estado",
                "Solicitudes",
                "Tokens",
                "Coste",
                "Tiempo p95 (ms)",
              ]}
            >
              {query.data.items.map((item) => (
                <TableRow key={`${item.useCase}-${item.provider}-${item.status}`}>
                  <TableCell className="font-medium">{useCaseLabels[item.useCase]}</TableCell>
                  <TableCell>{providerLabels[item.provider]}</TableCell>
                  <TableCell>
                    <StatusBadge>{usageStatusLabels[item.status]}</StatusBadge>
                  </TableCell>
                  <TableCell className="tabular-nums">{item.requests}</TableCell>
                  <TableCell className="tabular-nums">
                    {item.inputTokens + item.outputTokens}
                  </TableCell>
                  <TableCell>{formatUsd(item.totalCostUsd ?? item.knownCostUsd)}</TableCell>
                  <TableCell>{item.p95DurationMs ?? "sin dato"}</TableCell>
                </TableRow>
              ))}
            </DataTable>
          )}
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
        description="API keys de los proveedores, el asistente de la app y su consumo"
      />
      <AiOverview />
      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Proveedores</TabsTrigger>
          <TabsTrigger value="assistant">Usos de la IA</TabsTrigger>
          <TabsTrigger value="suggestions">Sugerencias del chat</TabsTrigger>
          <TabsTrigger value="usage">Uso</TabsTrigger>
        </TabsList>
        <TabsContent value="providers">
          <ProvidersPanel />
        </TabsContent>
        <TabsContent value="assistant">
          <div className="grid gap-4 xl:grid-cols-2">
            <RoutePanel useCase="assistant_chat" />
            <RoutePanel useCase="onboarding_setup" />
          </div>
        </TabsContent>
        <TabsContent value="suggestions">
          <SuggestionsPanel />
        </TabsContent>
        <TabsContent value="usage">
          <UsagePanel />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
