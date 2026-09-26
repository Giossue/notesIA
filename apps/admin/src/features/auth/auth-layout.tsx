import { NotebookPen } from "lucide-react";
import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

const year = new Date().getFullYear();

/**
 * Pantallas de acceso (plantilla "auth v2"): el formulario a la izquierda y un
 * panel de marca redondeado a la derecha, visible desde pantallas grandes.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main>
      <div className="grid h-dvh justify-center p-2 lg:grid-cols-2">
        <div className="relative order-2 hidden h-full rounded-3xl bg-primary lg:flex">
          <div className="absolute top-10 space-y-1 px-10 text-primary-foreground">
            <NotebookPen className="size-10" />
            <h1 className="font-medium text-2xl">NotesIA Admin</h1>
            <p className="text-sm">Planificación académica con apoyo de IA.</p>
          </div>

          <div className="absolute bottom-10 flex w-full justify-between px-10">
            <div className="flex-1 space-y-1 text-primary-foreground">
              <h2 className="font-medium">Acceso restringido</h2>
              <p className="text-sm">
                Solo cuentas administradoras, con verificación en dos pasos.
              </p>
            </div>
            <Separator orientation="vertical" className="mx-3 h-auto!" />
            <div className="flex-1 space-y-1 text-primary-foreground">
              <h2 className="font-medium">¿Necesitas ayuda?</h2>
              <p className="text-sm">
                Escribe al equipo de NotesIA de la Universidad Estatal de Bolívar.
              </p>
            </div>
          </div>
        </div>

        <div className="relative order-1 flex h-full">
          {children}
          <div className="absolute bottom-5 flex w-full justify-between px-10">
            <div className="text-sm">© {year}, NotesIA · UEB</div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Encabezado centrado del formulario de acceso. */
export function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2 text-center">
      <h1 className="font-medium text-3xl">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
