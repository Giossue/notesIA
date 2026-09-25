import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
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
import { sessionQuery } from "@/lib/query";

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
    <main className="mx-auto flex min-h-svh max-w-md items-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Administración de NotesIA</CardTitle>
          <CardDescription>Inicia sesión con una cuenta administradora.</CardDescription>
        </CardHeader>
        <form onSubmit={form.handleSubmit((values) => login.mutate(values))}>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.email)}>
                <FieldLabel htmlFor="email">Correo</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register("email")}
                />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.password)}>
                <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(form.formState.errors.password)}
                  {...form.register("password")}
                />
                <FieldError errors={[form.formState.errors.password]} />
              </Field>
              <FormMessage error={login.error} />
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? <Spinner data-icon="inline-start" /> : null}
              Entrar
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
