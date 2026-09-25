import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { FormMessage } from "@/components/form-message";
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authApi } from "@/lib/auth-api";

const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Escribe los seis dígitos.") });
const backupSchema = z.object({ code: z.string().trim().min(1, "Escribe un código de respaldo.") });
const otpSlotKeys = ["one", "two", "three", "four", "five", "six"] as const;

function TotpForm({ complete }: { complete: () => Promise<void> }) {
  const form = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });
  const verify = useMutation({ mutationFn: authApi.verifyTotp, onSuccess: complete });
  return (
    <form onSubmit={form.handleSubmit(({ code }) => verify.mutate(code))}>
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.code)}>
          <FieldLabel htmlFor="totp-code">Código del autenticador</FieldLabel>
          <Controller
            control={form.control}
            name="code"
            render={({ field }) => (
              <InputOTP id="totp-code" maxLength={6} inputMode="numeric" {...field}>
                <InputOTPGroup>
                  {otpSlotKeys.map((key, index) => (
                    <InputOTPSlot index={index} key={key} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            )}
          />
          <FieldError errors={[form.formState.errors.code]} />
        </Field>
        <FormMessage error={verify.error} />
        <Button type="submit" disabled={verify.isPending}>
          {verify.isPending ? <Spinner data-icon="inline-start" /> : null}
          Verificar
        </Button>
      </FieldGroup>
    </form>
  );
}

function BackupForm({ complete }: { complete: () => Promise<void> }) {
  const form = useForm<z.infer<typeof backupSchema>>({
    resolver: zodResolver(backupSchema),
    defaultValues: { code: "" },
  });
  const verify = useMutation({ mutationFn: authApi.verifyBackupCode, onSuccess: complete });
  return (
    <form onSubmit={form.handleSubmit(({ code }) => verify.mutate(code))}>
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.code)}>
          <FieldLabel htmlFor="backup-code">Código de respaldo</FieldLabel>
          <Input
            id="backup-code"
            autoComplete="one-time-code"
            aria-invalid={Boolean(form.formState.errors.code)}
            {...form.register("code")}
          />
          <FieldError errors={[form.formState.errors.code]} />
        </Field>
        <FormMessage error={verify.error} />
        <Button type="submit" disabled={verify.isPending}>
          {verify.isPending ? <Spinner data-icon="inline-start" /> : null}
          Usar código
        </Button>
      </FieldGroup>
    </form>
  );
}

export function TwoFactorChallengePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const complete = async () => {
    await queryClient.invalidateQueries();
    await navigate({ to: "/" });
  };
  return (
    <main className="mx-auto flex min-h-svh max-w-md items-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Segundo factor</CardTitle>
          <CardDescription>Confirma el acceso antes de abrir el panel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="totp">
            <TabsList>
              <TabsTrigger value="totp">Autenticador</TabsTrigger>
              <TabsTrigger value="backup">Código de respaldo</TabsTrigger>
            </TabsList>
            <TabsContent value="totp">
              <TotpForm complete={complete} />
            </TabsContent>
            <TabsContent value="backup">
              <BackupForm complete={complete} />
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => navigate({ to: "/login" })}>
            Volver
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
