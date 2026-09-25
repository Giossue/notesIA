import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "@/components/async-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { systemHealthQuery } from "@/lib/query";

export function SystemHealthPage() {
  const health = useQuery(systemHealthQuery);
  if (health.isPending) return <PageLoading />;
  if (health.isError) return <PageError error={health.error} retry={() => health.refetch()} />;
  const queues = Object.entries(health.data.queues);
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1>Salud del sistema</h1>
        <p>Última comprobación: {new Date(health.data.checkedAt).toLocaleString()}</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Estado general</CardTitle>
          <CardDescription>Base de datos, worker y alertas activas.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge>{health.data.database}</Badge>
          <Badge variant={health.data.worker.seenRecently ? "secondary" : "destructive"}>
            Worker {health.data.worker.seenRecently ? "activo" : "sin señal reciente"}
          </Badge>
          <Badge variant={health.data.alerts.length ? "destructive" : "secondary"}>
            {health.data.alerts.length} alertas
          </Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Colas</CardTitle>
          <CardDescription>Elementos pendientes, en proceso y agotados.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {queues.map(([name, queue]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>
                  pendientes {queue.pending}
                  {"; "}listos {queue.ready}
                  {"; "}en proceso {queue.inFlight}
                  {"; "}agotados {queue.dead}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>IA, últimos {health.data.ai.windowMinutes} minutos</CardTitle>
          <CardDescription>Coste conocido y solicitudes sin coste calculado.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>USD {health.data.ai.knownCostUsd}</p>
          <p>Sin coste calculado: {health.data.ai.uncostedRequests}</p>
        </CardContent>
      </Card>
    </section>
  );
}
