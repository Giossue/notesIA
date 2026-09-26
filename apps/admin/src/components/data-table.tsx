import type { ReactNode } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Tabla con el estilo de las tablas de la plantilla: borde redondeado y cabecera tenue. */
export function DataTable({ columns, children }: { columns: string[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-muted/15">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} className={column === "Acciones" ? "text-right" : undefined}>
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="[&>tr:nth-child(even)]:bg-muted/50 [&>tr:nth-child(even)]:hover:bg-muted">
          {children}
        </TableBody>
      </Table>
    </div>
  );
}
