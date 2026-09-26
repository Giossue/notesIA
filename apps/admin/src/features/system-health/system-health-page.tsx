import { useQuery } from "@tanstack/react-query";
import { Bell, BrainCircuit, Cpu, Database } from "lucide-react";
import { PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { Page, PageHeader } from "@/components/page-header";
import { StatCard, StatGrid } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
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
              {alerts.length} alertas
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
        <DataTable columns={["Cola", "Pendientes", "Listos", "En proceso", "Agotados"]}>
          {queues.map(([name, queue]) => (
            <TableRow key={name}>
              <TableCell className="font-medium">{label(queueLabels, name)}</TableCell>
              <TableCell className="tabular-nums">{queue.pending}</TableCell>
              <TableCell className="tabular-nums">{queue.ready}</TableCell>
              <TableCell className="tabular-nums">{queue.inFlight}</TableCell>
              <TableCell>
                <StatusBadge tone={queue.dead ? "danger" : "neutral"}>{queue.dead}</StatusBadge>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
    </Page>
  );
}
