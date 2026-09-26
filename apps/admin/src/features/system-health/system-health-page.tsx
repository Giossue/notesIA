import { useQuery } from "@tanstack/react-query";
import { Bell, BrainCircuit, Cpu, Database } from "lucide-react";
import { PageError, PageLoading } from "@/components/async-state";
import { DataTable } from "@/components/data-table";
import { Page, PageHeader } from "@/components/page-header";
import { StatCard, StatGrid } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
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
          value={<Badge variant="secondary">{database}</Badge>}
          footer="Estado de la conexión principal."
        />
        <StatCard
          icon={Cpu}
          label="Worker"
          value={
            <Badge variant={worker.seenRecently ? "secondary" : "destructive"}>
              Worker {worker.seenRecently ? "activo" : "sin señal reciente"}
            </Badge>
          }
          footer="Procesamiento en segundo plano."
        />
        <StatCard
          icon={Bell}
          label="Alertas activas"
          value={alerts.length}
          badge={
            <Badge variant={alerts.length ? "destructive" : "secondary"}>
              {alerts.length} alertas
            </Badge>
          }
          footer="Avisos pendientes de atención."
        />
        <StatCard
          icon={BrainCircuit}
          label={`IA, últimos ${ai.windowMinutes} minutos`}
          value={`USD ${ai.knownCostUsd}`}
          footer={`Sin coste calculado: ${ai.uncostedRequests}`}
        />
      </StatGrid>
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">Colas</h2>
          <p className="text-muted-foreground text-sm">
            Elementos pendientes, listos, en proceso y agotados.
          </p>
        </div>
        <DataTable columns={["Cola", "Pendientes", "Listos", "En proceso", "Agotados"]}>
          {queues.map(([name, queue]) => (
            <TableRow key={name}>
              <TableCell className="font-medium">{name}</TableCell>
              <TableCell className="tabular-nums">{queue.pending}</TableCell>
              <TableCell className="tabular-nums">{queue.ready}</TableCell>
              <TableCell className="tabular-nums">{queue.inFlight}</TableCell>
              <TableCell>
                <Badge variant={queue.dead ? "destructive" : "outline"}>{queue.dead}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
    </Page>
  );
}
