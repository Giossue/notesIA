import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authApi } from "@/lib/auth-api";
import { AuthHeading, AuthLayout } from "./auth-layout";

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
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(({ code }) => verify.mutate(code))}
    >
      <FieldGroup className="gap-4">
        <Field className="gap-1.5" data-invalid={Boolean(form.formState.errors.code)}>
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
        <Button className="w-full" type="submit" disabled={verify.isPending}>
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
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(({ code }) => verify.mutate(code))}
    >
      <FieldGroup className="gap-4">
        <Field className="gap-1.5" data-invalid={Boolean(form.formState.errors.code)}>
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
        <Button className="w-full" type="submit" disabled={verify.isPending}>
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
    <AuthLayout>
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <AuthHeading
          title="Segundo factor"
          description="Confirma el acceso antes de abrir el panel."
        />
        <Tabs defaultValue="totp" className="gap-4">
          <TabsList className="w-full">
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
        <Button variant="ghost" className="w-full" onClick={() => navigate({ to: "/login" })}>
          <ArrowLeft data-icon="inline-start" />
          Volver
        </Button>
      </div>
    </AuthLayout>
  );
}
