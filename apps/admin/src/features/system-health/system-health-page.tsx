import type { AdminSystemHealth } from "@notesia/contracts";
import { useQuery } from "@tanstack/react-query";
import { Bell, BrainCircuit, Cpu, Database } from "lucide-react";
import { useState } from "react";
import { PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { Page, PageHeader } from "@/components/page-header";
import { RowActions } from "@/components/row-actions";
import { StatCard, StatGrid } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { label, queueLabels } from "@/lib/labels";
import { systemHealthQuery } from "@/lib/query";

export function SystemHealthPage() {
  const health = useQuery(systemHealthQuery);
  if (health.isPending) return <PageLoading />;
  if (health.isError) return <PageError error={health.error} retry={() => health.refetch()} />;
  const queues = Object.entries(health.data.queues);
  const { database, worker, alerts, ai } = health.data;
  return (
    <Page>
      <PageHeader
        title="Salud del sistema"
        description={`Última comprobación: ${new Date(health.data.checkedAt).toLocaleString()}`}
        actions={
          <Button variant="outline" onClick={() => health.refetch()} disabled={health.isFetching}>
            {health.isFetching ? <Spinner data-icon="inline-start" /> : null}
            Actualizar
          </Button>
        }
      />
      <StatGrid>
        <StatCard
          icon={Database}
          label="Base de datos"
          value={
            <StatusBadge tone="success">
              {database === "ready" ? "Disponible" : database}
            </StatusBadge>
          }
          footer="Estado de la conexión principal"
        />
        <StatCard
          icon={Cpu}
          label="Procesos en segundo plano"
          value={
            <StatusBadge tone={worker.seenRecently ? "success" : "danger"}>
              {worker.seenRecently ? "Activos" : "Sin señal reciente"}
            </StatusBadge>
          }
          footer="Envío de correos, notificaciones y tareas programadas"
        />
        <StatCard
          icon={Bell}
          label="Alertas activas"
          value={alerts.length}
          badge={
            <StatusBadge tone={alerts.length ? "danger" : "success"}>
              {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
            </StatusBadge>
          }
          footer="Avisos pendientes de atención"
        />
        <StatCard
          icon={BrainCircuit}
          label={`IA, últimos ${ai.windowMinutes} minutos`}
          value={`$${ai.knownCostUsd}`}
          footer={`Sin coste calculado: ${ai.uncostedRequests}`}
        />
      </StatGrid>
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">Colas</h2>
          <p className="text-muted-foreground text-sm">
            Elementos pendientes, listos, en proceso y agotados
          </p>
        </div>
        <DataTable columns={["Cola", "Pendientes", "Listos", "En proceso", "Agotados", "Acciones"]}>
          {queues.map(([name, queue]) => (
            <TableRow key={name}>
              <TableCell className="font-medium">{label(queueLabels, name)}</TableCell>
              <TableCell className="tabular-nums">{queue.pending}</TableCell>
              <TableCell className="tabular-nums">{queue.ready}</TableCell>
              <TableCell className="tabular-nums">{queue.inFlight}</TableCell>
              <TableCell>
                <StatusBadge tone={queue.dead ? "danger" : "neutral"}>{queue.dead}</StatusBadge>
              </TableCell>
              <TableCell>
                <QueueActions
                  name={name as QueueName}
                  queue={queue}
                  alerts={alerts.filter((alert) => "queue" in alert && alert.queue === name)}
                />
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
    </Page>
  );
}

type QueueName = keyof AdminSystemHealth["queues"];
type QueueHealth = AdminSystemHealth["queues"][QueueName];

const queueDescriptions: Record<QueueName, string> = {
  outbox: "Eventos que la API deja para el worker, como avisar que se aplicó un plan.",
  push: "Notificaciones push pendientes de enviar a los teléfonos (una por dispositivo).",
  recoveryMail: "Correos para restablecer la contraseña.",
  verificationMail: "Correos para verificar la cuenta después del registro.",
};

const queueColumns = [
  ["pending", "Pendientes", "En espera, incluidos los programados para más tarde."],
  ["ready", "Listos", "Ya deberían salir; el worker los toma en segundos."],
  ["inFlight", "En proceso", "El worker los está enviando ahora mismo."],
  ["dead", "Agotados", "Fallaron en todos los reintentos y ya no se reintentan."],
] as const;

function QueueActions({
  name,
  queue,
  alerts,
}: {
  name: QueueName;
  queue: QueueHealth;
  alerts: AdminSystemHealth["alerts"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <RowActions actions={[{ label: "Ver detalles", select: () => setOpen(true) }]}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{label(queueLabels, name)}</DialogTitle>
            <DialogDescription>{queueDescriptions[name]}</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-3">
            {queueColumns.map(([key, title, hint]) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div>
                  <dt className="font-medium text-sm">{title}</dt>
                  <dd className="text-muted-foreground text-sm">{hint}</dd>
                </div>
                <StatusBadge tone={key === "dead" && queue.dead ? "danger" : "neutral"}>
                  {queue[key]}
                </StatusBadge>
              </div>
            ))}
            <div className="flex items-start justify-between gap-4">
              <dt className="font-medium text-sm">Listo más antiguo</dt>
              <dd className="text-muted-foreground text-sm">
                {queue.oldestReadyAt ? new Date(queue.oldestReadyAt).toLocaleString() : "Ninguno"}
              </dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-sm">Alertas</h3>
            {alerts.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin alertas: la cola funciona bien.</p>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.code}
                  className="rounded-md border border-destructive/40 p-3 text-sm"
                >
                  {alert.code === "QUEUE_DEAD" ? (
                    <>
                      <p className="font-medium">Hay elementos agotados</p>
                      <p className="text-muted-foreground">
                        Revisa los registros del worker. Si el fallo ya se corrigió (por ejemplo, la
                        configuración del correo), los agotados son viejos y se pueden limpiar de la
                        base de datos.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">La cola se está acumulando</p>
                      <p className="text-muted-foreground">
                        Hay muchos elementos listos o uno lleva demasiado esperando. Comprueba que
                        el worker esté activo y que el servicio de envío responda.
                      </p>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RowActions>
  );
}
