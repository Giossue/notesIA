import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/auth-api";
import { sessionQuery } from "@/lib/query";
import { AuthHeading, AuthLayout } from "./auth-layout";

const loginSchema = z.object({
  email: z.email("Escribe un correo válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQuery);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const login = useMutation({
    mutationFn: ({ email, password }: LoginValues) => authApi.signIn(email, password),
    onSuccess: async (result) => {
      form.reset({ email: form.getValues("email"), password: "" });
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
      await navigate({ to: result.twoFactorRedirect ? "/two-factor" : "/" });
    },
  });

  if (session.data) return <Navigate to="/" />;
  return (
    <AuthLayout>
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <AuthHeading
          title="Inicia sesión"
          description="Ingresa con tu cuenta administradora de NotesIA."
        />
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => login.mutate(values))}
          className="flex flex-col gap-4"
        >
          <FieldGroup className="gap-4">
            <Field className="gap-1.5" data-invalid={Boolean(form.formState.errors.email)}>
              <FieldLabel htmlFor="email">Correo</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                autoComplete="username"
                aria-invalid={Boolean(form.formState.errors.email)}
                {...form.register("email")}
              />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>
            <Field className="gap-1.5" data-invalid={Boolean(form.formState.errors.password)}>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                {...form.register("password")}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>
          </FieldGroup>
          <Button className="w-full" type="submit" disabled={login.isPending}>
            {login.isPending ? <Spinner data-icon="inline-start" /> : null}
            Entrar
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
