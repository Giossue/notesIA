import type { ReactNode } from "react";

/** Pantallas de acceso: solo el formulario, centrado en la ventana. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center p-4">{children}</main>;
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
