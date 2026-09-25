import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
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
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/auth-api";

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
    <main className="mx-auto flex min-h-svh max-w-md items-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Crear una nueva contraseña</CardTitle>
          <CardDescription>El enlace es de un solo uso y vence automáticamente.</CardDescription>
        </CardHeader>
        {!token ? (
          <CardContent>
            <p role="alert">El enlace no contiene un token válido.</p>
          </CardContent>
        ) : reset.isSuccess ? (
          <CardContent className="space-y-4">
            <p role="status">Contraseña actualizada. Ya puedes iniciar sesión.</p>
            <Button asChild>
              <Link to="/login">Ir al inicio de sesión</Link>
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={form.handleSubmit((values) => reset.mutate(values))}>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.password)}>
                  <FieldLabel htmlFor="new-password">Nueva contraseña</FieldLabel>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(form.formState.errors.password)}
                    {...form.register("password")}
                  />
                  <FieldError errors={[form.formState.errors.password]} />
                </Field>
                <Field data-invalid={Boolean(form.formState.errors.confirmation)}>
                  <FieldLabel htmlFor="confirm-password">Confirmar contraseña</FieldLabel>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(form.formState.errors.confirmation)}
                    {...form.register("confirmation")}
                  />
                  <FieldError errors={[form.formState.errors.confirmation]} />
                </Field>
                <FormMessage error={reset.error} />
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={reset.isPending}>
                {reset.isPending ? <Spinner data-icon="inline-start" /> : null}Cambiar contraseña
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  );
}
