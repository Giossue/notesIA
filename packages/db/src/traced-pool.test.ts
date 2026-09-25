import { expect, test } from "bun:test";
import { createTraceContext, runWithTraceContext } from "@notesia/observability";
import type { Pool, PoolClient } from "pg";
import { createTracedPool } from "./traced-pool";

test("traced pool links queries and never records SQL or parameters", async () => {
  const observations: Parameters<typeof createTracedPool>[1] extends (event: infer Event) => void
    ? Event[]
    : never = [];
  const client = {
    query: async () => ({ rows: [{ value: 1 }] }),
    release() {},
  } as unknown as PoolClient;
  const base = {
    query: async () => ({ rows: [{ value: 1 }] }),
    connect: async () => client,
  } as unknown as Pool;
  const pool = createTracedPool(base, (event) => observations.push(event));
  const root = createTraceContext();

  await runWithTraceContext(root, async () => {
    await pool.query("SELECT $1::text AS private", ["secret-value"]);
    const connection = await pool.connect();
    await connection.query("SELECT 'private-sql'");
    connection.release();
  });

  expect(observations).toHaveLength(2);
  expect(observations.every((event) => event.traceId === root.traceId)).toBe(true);
  expect(observations.every((event) => event.parentSpanId === root.spanId)).toBe(true);
  expect(observations).toMatchObject([
    { name: "db.query", component: "database", target: "postgresql", outcome: "ok" },
    { name: "db.query", component: "database", target: "postgresql", outcome: "ok" },
  ]);
  expect(JSON.stringify(observations)).not.toContain("private");
  expect(JSON.stringify(observations)).not.toContain("secret-value");
});
