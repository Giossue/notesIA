import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";

type Context = { client: PoolClient; nestedActive: boolean; active: boolean };

export function createRequestTransactionPool(basePool: Pool) {
  const storage = new AsyncLocalStorage<Context>();

  const scopedPool = new Proxy(basePool, {
    get(target, property) {
      if (property === "query")
        return (...args: unknown[]) => {
          const context = storage.getStore();
          if (context && !context.active) throw new Error("Request transaction is closed");
          const connection = context?.client ?? target;
          return Reflect.apply(connection.query, connection, args);
        };
      if (property === "connect")
        return async () => {
          const context = storage.getStore();
          if (!context) return target.connect();
          if (!context.active) throw new Error("Request transaction is closed");
          if (context.nestedActive)
            throw new Error("Concurrent nested transactions are unsupported");
          context.nestedActive = true;
          const savepoint = `request_${crypto.randomUUID().replaceAll("-", "")}`;
          let state: "idle" | "open" | "closed" = "idle";
          return new Proxy(context.client, {
            get(client, clientProperty) {
              if (clientProperty === "query")
                return async (...args: unknown[]) => {
                  if (!context.active) throw new Error("Request transaction is closed");
                  const command = typeof args[0] === "string" ? args[0].trim().toUpperCase() : "";
                  if (command === "BEGIN") {
                    if (state !== "idle") throw new Error("Nested transaction already started");
                    await client.query(`SAVEPOINT ${savepoint}`);
                    state = "open";
                    return;
                  }
                  if (command === "COMMIT" || command === "ROLLBACK") {
                    if (state !== "open") throw new Error("Nested transaction is not open");
                    if (command === "ROLLBACK")
                      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
                    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
                    state = "closed";
                    return;
                  }
                  return Reflect.apply(client.query, client, args);
                };
              if (clientProperty === "release")
                return () => {
                  context.nestedActive = false;
                  if (state === "open") throw new Error("Nested transaction was not closed");
                };
              const value = Reflect.get(client, clientProperty, client);
              return typeof value === "function" && clientProperty !== "constructor"
                ? value.bind(client)
                : value;
            },
          }) as PoolClient;
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" && property !== "constructor" ? value.bind(target) : value;
    },
  }) as Pool;

  return {
    pool: scopedPool,
    async withTransaction<T>(action: () => Promise<T>): Promise<T> {
      if (storage.getStore()) throw new Error("Request transaction is already open");
      const client = await basePool.connect();
      const context: Context = { client, nestedActive: false, active: true };
      try {
        await client.query("BEGIN");
        const value = await storage.run(context, action);
        context.active = false;
        await client.query("COMMIT");
        return value;
      } catch (caught) {
        context.active = false;
        await client.query("ROLLBACK").catch(() => {});
        throw caught;
      } finally {
        client.release();
      }
    },
  };
}
