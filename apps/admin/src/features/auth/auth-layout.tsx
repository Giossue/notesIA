import type { ReactNode } from "react";

/**
 * Pantallas de acceso (plantilla "auth v2"): el formulario a la izquierda y un
 * panel de color redondeado a la derecha, visible desde pantallas grandes.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main>
      <div className="grid h-dvh justify-center p-2 lg:grid-cols-2">
        <div className="order-2 hidden h-full rounded-3xl bg-primary lg:flex" />
        <div className="relative order-1 flex h-full">{children}</div>
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
