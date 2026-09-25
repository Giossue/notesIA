import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const target = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Performance check only runs against local notesia_dev");
if (!process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required");

const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const email = `performance-${crypto.randomUUID()}@example.test`;
const password = `Performance-${crypto.randomUUID()}-2026!`;
let userId: string | null = null;
let cookie: string | null = null;
let processHandle: ReturnType<typeof Bun.spawn> | null = null;
let baseUrl = "";

function localDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function responseStatus(response: Response, expected: number, operation: string) {
  await response.text();
  if (response.status !== expected)
    throw new Error(`${operation} returned HTTP ${response.status}; expected ${expected}`);
}

async function runLoad(
  name: string,
  count: number,
  concurrency: number,
  operation: (index: number) => Promise<void>,
) {
  let next = 0;
  let failure: unknown = null;
  const times: number[] = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < count && !failure) {
        const index = next++;
        const before = performance.now();
        try {
          await operation(index);
        } catch (caught) {
          failure = caught;
          return;
        }
        times.push(performance.now() - before);
      }
    }),
  );
  if (failure) throw failure;
  times.sort((a, b) => a - b);
  const elapsed = performance.now() - started;
  return {
    name,
    requests: count,
    concurrency,
    p50Ms: Number((times[Math.ceil(count * 0.5) - 1] ?? 0).toFixed(1)),
    p95Ms: Number((times[Math.ceil(count * 0.95) - 1] ?? 0).toFixed(1)),
    maxMs: Number((times.at(-1) ?? 0).toFixed(1)),
    requestsPerSecond: Number(((count * 1000) / elapsed).toFixed(1)),
  };
}

async function waitForApi() {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (processHandle && processHandle.exitCode !== null)
      throw new Error("API process exited during startup");
    try {
      const response = await fetch(`${baseUrl}/v1/ready`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // The loopback server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("API did not become ready on loopback");
}

try {
  const verified = await pool.query<{ database: string; address: string; port: number }>(
    `SELECT current_database() AS database, host(inet_server_addr()) AS address,
       inet_server_port() AS port`,
  );
  if (
    verified.rows[0]?.database !== "notesia_dev" ||
    verified.rows[0]?.port !== 5432 ||
    !["127.0.0.1", "::1"].includes(verified.rows[0]?.address)
  )
    throw new Error("Connected PostgreSQL target is not local notesia_dev");

  const reservation = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null, { status: 503 }),
  });
  const port = reservation.port;
  await reservation.stop();
  baseUrl = `http://127.0.0.1:${port}`;
  processHandle = Bun.spawn([process.execPath, "apps/api/src/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      BETTER_AUTH_URL: baseUrl,
      ALLOW_SIGNUP: "true",
      NODE_ENV: "development",
    },
    stdout: "ignore",
    stderr: "ignore",
  });
  await waitForApi();

  const registered = await fetch(`${baseUrl}/v1/auth/sign-up/email`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({
      name: "Prueba de rendimiento",
      email,
      password,
    }),
  });
  await responseStatus(registered, 200, "registration");
  const user = await pool.query<{ id: string }>(
    "SELECT id FROM autenticacion.usuarios WHERE correo = $1",
    [email],
  );
  userId = user.rows[0]?.id ?? null;
  if (!userId) throw new Error("Synthetic user was not persisted");
  await pool.query("UPDATE autenticacion.usuarios SET correo_verificado = true WHERE id = $1", [
    userId,
  ]);
  const signedIn = await fetch(`${baseUrl}/v1/auth/sign-in/email`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ email, password }),
  });
  cookie = signedIn.headers.get("set-cookie")?.split(";")[0] ?? null;
  await responseStatus(signedIn, 200, "sign in after local verification");
  if (!cookie) throw new Error("Verified synthetic user did not receive a session");

  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() + 1);
  const through = new Date(from.getTime() + 7 * 86400000);
  const deadline = new Date(from.getTime() + 5 * 86400000 + 12 * 3600000);
  await pool.query(
    "UPDATE dominio.perfiles_usuario SET zona_horaria = 'Etc/UTC' WHERE usuario_id = $1",
    [userId],
  );
  await pool.query(
    `INSERT INTO dominio.materias (id, usuario_id, nombre, codigo, color)
     SELECT gen_random_uuid(), $1, 'Materia de prueba ' || n, 'BENCH' || n, 'primary'
     FROM generate_series(1,20) n`,
    [userId],
  );
  await pool.query(
    `INSERT INTO dominio.reglas_disponibilidad
       (id, usuario_id, dia_semana, minuto_inicio, minuto_fin)
     SELECT gen_random_uuid(), $1, n, 540, 1020 FROM generate_series(1,7) n`,
    [userId],
  );
  await pool.query(
    `INSERT INTO dominio.actividades
       (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     SELECT gen_random_uuid(), $1, 'academic_task', 'Carga de prueba ' || n,
       'medium', $2, 60 FROM generate_series(1,50) n`,
    [userId, deadline],
  );

  const list = () =>
    fetch(`${baseUrl}/v1/subjects`, {
      headers: { cookie: cookie as string },
      signal: AbortSignal.timeout(10000),
    }).then((response) => responseStatus(response, 200, "subject list"));
  const create = (index: number) =>
    fetch(`${baseUrl}/v1/subjects`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        cookie: cookie as string,
        "content-type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        name: `Medición ${index}`,
        code: null,
        colorToken: "primary",
      }),
    }).then((response) => responseStatus(response, 201, "subject create"));
  const preview = () =>
    fetch(`${baseUrl}/v1/plans/preview`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: { cookie: cookie as string, "content-type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        from: localDate(from),
        through: localDate(through),
      }),
    }).then((response) => responseStatus(response, 201, "plan preview"));

  await runLoad("warmup-list", 20, 5, list);
  const listResult = await runLoad("subject-list", 200, 10, list);
  await runLoad("warmup-create", 10, 5, create);
  const createResult = await runLoad("subject-create-idempotent", 200, 10, create);
  await runLoad("warmup-preview", 3, 2, preview);
  const previewResult = await runLoad("weekly-preview", 50, 5, preview);
  console.log(
    JSON.stringify(
      {
        target: "127.0.0.1 / notesia_dev",
        scenario: "20 subjects, 50 pending activities, seven weekly availability rules",
        results: [listResult, createResult, previewResult],
      },
      null,
      2,
    ),
  );
  if (listResult.p95Ms > 500 || createResult.p95Ms > 500 || previewResult.p95Ms > 2000)
    throw new Error("Local p95 exceeds the product requirement");
} finally {
  try {
    if (cookie && baseUrl)
      await fetch(`${baseUrl}/v1/auth/sign-out`, {
        method: "POST",
        signal: AbortSignal.timeout(3000),
        headers: { cookie, origin: baseUrl },
      }).catch(() => {});
    if (userId) await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [userId]);
  } finally {
    try {
      if (processHandle) {
        const child = processHandle;
        const force = setTimeout(() => child.kill("SIGKILL"), 5000);
        try {
          if (child.exitCode === null) child.kill("SIGTERM");
          await child.exited;
        } finally {
          clearTimeout(force);
        }
      }
    } finally {
      await pool.end();
    }
  }
}
