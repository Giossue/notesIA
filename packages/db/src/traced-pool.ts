import { currentTraceContext, type TraceObservation, withTraceSpan } from "@notesia/observability";
import type { Pool, PoolClient } from "pg";

type ObserveTrace = (event: TraceObservation) => void;

function tracedClient(client: PoolClient, observe?: ObserveTrace) {
  return new Proxy(client, {
    get(target, property) {
      if (property === "query")
        return (...args: unknown[]) => {
          if (!currentTraceContext()) return Reflect.apply(target.query, target, args);
          return withTraceSpan(
            {
              name: "db.query",
              component: "database",
              target: "postgresql",
              ...(observe ? { observe } : {}),
            },
            () => Reflect.apply(target.query, target, args),
          );
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" && property !== "constructor" ? value.bind(target) : value;
    },
  }) as PoolClient;
}

export function createTracedPool(pool: Pool, observe?: ObserveTrace) {
  return new Proxy(pool, {
    get(target, property) {
      if (property === "query")
        return (...args: unknown[]) => {
          if (!currentTraceContext()) return Reflect.apply(target.query, target, args);
          return withTraceSpan(
            {
              name: "db.query",
              component: "database",
              target: "postgresql",
              ...(observe ? { observe } : {}),
            },
            () => Reflect.apply(target.query, target, args),
          );
        };
      if (property === "connect") return async () => tracedClient(await target.connect(), observe);
      const value = Reflect.get(target, property, target);
      return typeof value === "function" && property !== "constructor" ? value.bind(target) : value;
    },
  }) as Pool;
}
