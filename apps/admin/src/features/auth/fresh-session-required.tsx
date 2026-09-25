import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/auth-api";

export function FreshSessionRequired() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: authApi.signOut,
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/login" });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vuelve a confirmar el acceso</CardTitle>
        <CardDescription>
          El segundo factor cambió después de crear esta sesión. Inicia sesión otra vez.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormMessage error={signOut.error} />
      </CardContent>
      <CardFooter>
        <Button onClick={() => signOut.mutate()} disabled={signOut.isPending}>
          {signOut.isPending ? <Spinner data-icon="inline-start" /> : null}
          Volver a iniciar sesión
        </Button>
      </CardFooter>
    </Card>
  );
}
