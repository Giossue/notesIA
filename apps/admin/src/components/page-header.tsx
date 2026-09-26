import type { ReactNode } from "react";

/** Encabezado de página: título, descripción y acciones a la derecha. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="font-medium text-2xl tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Contenedor estándar de página del panel. */
export function Page({ children }: { children: ReactNode }) {
  return <section className="@container/main flex flex-col gap-4 md:gap-6">{children}</section>;
}
