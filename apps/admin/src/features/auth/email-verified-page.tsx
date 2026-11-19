import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthHeading, AuthLayout } from "./auth-layout";

/**
 * Resultado de abrir el enlace del correo de verificación. La cuenta ya se verificó (o falló)
 * en el servidor antes de llegar aquí; esta página solo lo cuenta y no necesita la app.
 */
export function EmailVerifiedPage() {
  const failed = new URLSearchParams(window.location.search).has("error");
  return (
    <AuthLayout>
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <AuthHeading
          title={failed ? "No se pudo verificar" : "Correo verificado"}
          description={
            failed ? "El enlace no es válido o ya venció" : "Tu cuenta de NotesIA ya está activa"
          }
        />
        {failed ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p>
                Abre NotesIA, toca «Reenviar correo» y usa el enlace nuevo. Los enlaces duran 15
                minutos.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                <p role="status">Ya puedes volver a NotesIA e iniciar sesión.</p>
              </AlertDescription>
            </Alert>
            <Button className="w-full" asChild>
              <a href="notesia://email-verified">Abrir NotesIA</a>
            </Button>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
