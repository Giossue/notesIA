import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/auth-api";
import { AuthHeading } from "./auth-layout";

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
    <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
      <AuthHeading
        title="Vuelve a confirmar el acceso"
        description="El segundo factor cambió después de crear esta sesión. Inicia sesión otra vez."
      />
      <div className="flex flex-col gap-4">
        <Button className="w-full" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
          {signOut.isPending ? <Spinner data-icon="inline-start" /> : null}
          Volver a iniciar sesión
        </Button>
      </div>
    </div>
  );
}
