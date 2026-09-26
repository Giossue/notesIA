import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { authApi, type TwoFactorSetup } from "@/lib/auth-api";
import { AuthHeading } from "./auth-layout";

const passwordSchema = z.object({ password: z.string().min(1, "Escribe tu contraseña.") });
const verificationSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Escribe los seis dígitos."),
  saved: z.literal(true, { error: "Guarda los códigos antes de continuar." }),
});
const otpSlotKeys = ["one", "two", "three", "four", "five", "six"] as const;

export function TwoFactorEnrollment() {
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });
  const verificationForm = useForm<z.infer<typeof verificationSchema>>({
    resolver: zodResolver(verificationSchema),
    defaultValues: { code: "", saved: false as never },
  });
  const enable = useMutation({
    mutationFn: authApi.enableTwoFactor,
    onSuccess: (result) => {
      passwordForm.reset();
      setSetup(result);
    },
  });
  const verify = useMutation({
    mutationFn: authApi.verifyTotp,
    onSuccess: async () => {
      setSetup(null);
      verificationForm.reset();
      await queryClient.invalidateQueries();
    },
  });
  const secret = setup ? new URL(setup.totpURI).searchParams.get("secret") : null;

  if (!setup)
    return (
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <AuthHeading
          title="Protege la cuenta administradora"
          description="El panel requiere TOTP. Confirma tu contraseña para iniciar la configuración."
        />
        <form
          noValidate
          onSubmit={passwordForm.handleSubmit(({ password }) => enable.mutate(password))}
          className="flex flex-col gap-4"
        >
          <FieldGroup className="gap-4">
            <Field
              className="gap-1.5"
              data-invalid={Boolean(passwordForm.formState.errors.password)}
            >
              <FieldLabel htmlFor="enrollment-password">Contraseña actual</FieldLabel>
              <Input
                id="enrollment-password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                aria-invalid={Boolean(passwordForm.formState.errors.password)}
                {...passwordForm.register("password")}
              />
              <FieldError errors={[passwordForm.formState.errors.password]} />
            </Field>
          </FieldGroup>
          <Button className="w-full" type="submit" disabled={enable.isPending}>
            {enable.isPending ? <Spinner data-icon="inline-start" /> : null}
            Configurar autenticador
          </Button>
        </form>
      </div>
    );

  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-8 py-6 sm:w-[350px]">
      <AuthHeading
        title="Completa el segundo factor"
        description="Añade la cuenta en una aplicación TOTP y guarda los códigos de respaldo."
      />
      <form
        noValidate
        onSubmit={verificationForm.handleSubmit(({ code }) => verify.mutate(code))}
        className="flex flex-col gap-4"
      >
        <FieldGroup className="gap-4">
          <Alert>
            <KeyRound />
            <AlertTitle>Clave manual</AlertTitle>
            <AlertDescription>
              <code className="break-all font-mono">{secret}</code>
            </AlertDescription>
          </Alert>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="totp-uri">Enlace de configuración</FieldLabel>
            <Input id="totp-uri" value={setup.totpURI} readOnly />
            <FieldDescription>
              Puedes abrir este enlace desde un dispositivo con una aplicación autenticadora.
            </FieldDescription>
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>Códigos de respaldo</FieldLabel>
            <ul
              aria-label="Códigos de respaldo"
              className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-xs"
            >
              {setup.backupCodes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
          </Field>
          <Field
            orientation="horizontal"
            data-invalid={Boolean(verificationForm.formState.errors.saved)}
          >
            <Controller
              control={verificationForm.control}
              name="saved"
              render={({ field }) => (
                <Checkbox
                  id="backup-codes-saved"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-invalid={Boolean(verificationForm.formState.errors.saved)}
                />
              )}
            />
            <FieldContent>
              <FieldLabel htmlFor="backup-codes-saved">
                <FieldTitle>Guardé los códigos en un lugar seguro</FieldTitle>
              </FieldLabel>
              <FieldError errors={[verificationForm.formState.errors.saved]} />
            </FieldContent>
          </Field>
          <Field className="gap-1.5" data-invalid={Boolean(verificationForm.formState.errors.code)}>
            <FieldLabel htmlFor="enrollment-code">Primer código TOTP</FieldLabel>
            <Controller
              control={verificationForm.control}
              name="code"
              render={({ field }) => (
                <InputOTP id="enrollment-code" maxLength={6} inputMode="numeric" {...field}>
                  <InputOTPGroup>
                    {otpSlotKeys.map((key, index) => (
                      <InputOTPSlot index={index} key={key} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              )}
            />
            <FieldError errors={[verificationForm.formState.errors.code]} />
          </Field>
        </FieldGroup>
        <Button className="w-full" type="submit" disabled={verify.isPending}>
          {verify.isPending ? <Spinner data-icon="inline-start" /> : null}
          Activar segundo factor
        </Button>
      </form>
    </div>
  );
}
