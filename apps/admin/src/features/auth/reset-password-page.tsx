import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormMessage } from "@/components/form-message";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/auth-api";
import { AuthHeading, AuthLayout } from "./auth-layout";

const schema = z
  .object({
    password: z.string().min(12, "Usa al menos 12 caracteres."),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    path: ["confirmation"],
    message: "Las contraseñas no coinciden.",
  });
type Values = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmation: "" },
  });
  const reset = useMutation({
    mutationFn: ({ password }: Values) => authApi.resetPassword(token, password),
    onSuccess: () => form.reset(),
  });
  return (
    <AuthLayout>
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <AuthHeading
          title="Crear una nueva contraseña"
          description="El enlace es de un solo uso y vence automáticamente."
        />
        {!token ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p role="alert">El enlace no contiene un token válido.</p>
            </AlertDescription>
          </Alert>
        ) : reset.isSuccess ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                <p role="status">Contraseña actualizada. Ya puedes iniciar sesión.</p>
              </AlertDescription>
            </Alert>
            <Button className="w-full" asChild>
              <Link to="/login">Ir al inicio de sesión</Link>
            </Button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={form.handleSubmit((values) => reset.mutate(values))}
            className="flex flex-col gap-4"
          >
            <FieldGroup className="gap-4">
              <Field className="gap-1.5" data-invalid={Boolean(form.formState.errors.password)}>
                <FieldLabel htmlFor="new-password">Nueva contraseña</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={Boolean(form.formState.errors.password)}
                  {...form.register("password")}
                />
                <FieldError errors={[form.formState.errors.password]} />
              </Field>
              <Field className="gap-1.5" data-invalid={Boolean(form.formState.errors.confirmation)}>
                <FieldLabel htmlFor="confirm-password">Confirmar contraseña</FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={Boolean(form.formState.errors.confirmation)}
                  {...form.register("confirmation")}
                />
                <FieldError errors={[form.formState.errors.confirmation]} />
              </Field>
              <FormMessage error={reset.error} />
            </FieldGroup>
            <Button className="w-full" type="submit" disabled={reset.isPending}>
              {reset.isPending ? <Spinner data-icon="inline-start" /> : null}
              Cambiar contraseña
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
