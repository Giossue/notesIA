import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { RowActions } from "@/components/row-actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { type AdminSuggestion, adminApi } from "@/lib/admin-api";
import { auditQueryKey } from "@/lib/query";

const suggestionsKey = ["admin", "assistant-suggestions"] as const;

/** Crear o editar una sugerencia (texto y si se muestra en la app). */
function SuggestionDialog({
  suggestion,
  open,
  setOpen,
}: {
  suggestion?: AdminSuggestion;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(suggestion?.text ?? "");
  const [active, setActive] = useState(suggestion?.active ?? true);
  const save = useMutation({
    mutationFn: () =>
      suggestion
        ? adminApi.updateSuggestion(suggestion.id, {
            text: text.trim(),
            active,
            version: suggestion.version,
          })
        : adminApi.createSuggestion({ text: text.trim(), active }),
    onSuccess: async () => {
      toast.success(suggestion ? "Sugerencia actualizada" : "Sugerencia agregada");
      setOpen(false);
      if (!suggestion) setText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: suggestionsKey }),
        queryClient.invalidateQueries({ queryKey: auditQueryKey }),
      ]);
    },
  });
  const valid = text.trim().length >= 3 && text.trim().length <= 120;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{suggestion ? "Editar sugerencia" : "Nueva sugerencia"}</DialogTitle>
          <DialogDescription>
            Una frase corta que el estudiante puede tocar para empezar a hablar con el asistente
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="suggestion-text">Texto</FieldLabel>
            <Input
              id="suggestion-text"
              value={text}
              maxLength={120}
              placeholder="Por ejemplo: ¿Qué tengo esta semana?"
              onChange={(event) => setText(event.target.value)}
            />
            <FieldDescription>{text.trim().length}/120 caracteres</FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="suggestion-active"
              checked={active}
              onCheckedChange={(value) => setActive(value === true)}
            />
            <FieldLabel htmlFor="suggestion-active">Mostrar en la app</FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuggestionActions({ suggestion }: { suggestion: AdminSuggestion }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: suggestionsKey }),
      queryClient.invalidateQueries({ queryKey: auditQueryKey }),
    ]);
  const toggle = useMutation({
    mutationFn: () =>
      adminApi.updateSuggestion(suggestion.id, {
        text: suggestion.text,
        active: !suggestion.active,
        version: suggestion.version,
      }),
    onSuccess: async () => {
      toast.success(
        suggestion.active ? "Sugerencia oculta en la app" : "Sugerencia visible en la app",
      );
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => adminApi.deleteSuggestion(suggestion.id),
    onSuccess: async () => {
      toast.success("Sugerencia eliminada");
      await refresh();
    },
  });
  return (
    <RowActions
      actions={[
        { label: "Editar", select: () => setEditing(true) },
        { label: suggestion.active ? "Ocultar" : "Mostrar", select: () => toggle.mutate() },
        { label: "Eliminar", destructive: true, select: () => remove.mutate() },
      ]}
    >
      {editing && <SuggestionDialog suggestion={suggestion} open={editing} setOpen={setEditing} />}
    </RowActions>
  );
}

/** Frases del chat del asistente: la app muestra 3 al azar entre las visibles. */
export function SuggestionsPanel() {
  const query = useQuery({ queryKey: suggestionsKey, queryFn: adminApi.suggestions });
  const [creating, setCreating] = useState(false);
  if (query.isPending) return <PageLoading />;
  if (query.isError) return <PageError error={query.error} retry={() => query.refetch()} />;
  const items = query.data.items;
  const visible = items.filter((item) => item.active).length;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Sugerencias del chat</CardTitle>
          <CardDescription>
            Al abrir el asistente, la app muestra 3 al azar entre las visibles · {visible} visibles
            de {items.length}
          </CardDescription>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus data-icon="inline-start" />
          Nueva
        </Button>
      </CardHeader>
      <CardContent>
        <DataTable columns={["Sugerencia", "Estado", "Acciones"]}>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="whitespace-normal">{item.text}</TableCell>
              <TableCell>
                <StatusBadge tone={item.active ? "success" : "neutral"}>
                  {item.active ? "Visible" : "Oculta"}
                </StatusBadge>
              </TableCell>
              <TableCell className="w-12 text-right">
                <SuggestionActions suggestion={item} />
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </CardContent>
      {creating && <SuggestionDialog open={creating} setOpen={setCreating} />}
    </Card>
  );
}
