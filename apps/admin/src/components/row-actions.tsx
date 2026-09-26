import { EllipsisVertical } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction = {
  label: string;
  select: () => void;
  destructive?: boolean;
};

/** Menú ⋮ de la columna de acciones: las destructivas van al final. */
export function RowActions({ actions, children }: { actions: RowAction[]; children?: ReactNode }) {
  const regular = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
            <EllipsisVertical />
            <span className="sr-only">Abrir acciones</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {regular.map((action) => (
            <DropdownMenuItem key={action.label} onSelect={action.select}>
              {action.label}
            </DropdownMenuItem>
          ))}
          {destructive.map((action) => (
            <DropdownMenuItem key={action.label} variant="destructive" onSelect={action.select}>
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {children}
    </>
  );
}
