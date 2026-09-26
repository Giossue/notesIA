import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createActivityRepository,
  createAdminRepository,
  createNotificationRepository,
  createPlanRepository,
  createProfileRepository,
  createTimeEntryRepository,
} from "@notesia/db";
import { Hono } from "hono";
import { Client, Pool } from "pg";
import { registerNotificationRoutes } from "./modules/notifications/routes";
import { registerTimeEntryRoutes } from "./modules/time-entries/routes";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for pagination tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Pagination tests require local notesia_dev credentials");
const name = `notesia_pagination_test_${crypto.randomUUID().replaceAll("-", "")}`;
const url = new URL(local);
url.pathname = `/${name}`;
const admin = new Client({
  host: "127.0.0.1",
  port: Number(local.port || 5432),
  user: "postgres",
  database: "postgres",
});
const owner = crypto.randomUUID();
const other = crypto.randomUUID();
const activity = crypto.randomUUID();
let seed: Pool;
let runtime: Pool;
let app: Hono;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  seed = new Pool({
    host: "127.0.0.1",
    port: Number(local.port || 5432),
    user: "postgres",
    database: name,
  });
  const migrations = join(import.meta.dir, "../../../packages/db/migrations");
  for (const file of readdirSync(migrations)
    .filter((item) => /^\d{4}_.+\.sql$/.test(item))
    .sort())
    await seed.query(readFileSync(join(migrations, file), "utf8"));
  await seed.query(
    `insert into autenticacion.usuarios (id, nombre, correo, correo_verificado)
     values ($1, 'Avisos', $3, false), ($2, 'Otro', $4, false)`,
    [owner, other, `${owner}@example.test`, `${other}@example.test`],
  );
  await seed.query(
    `insert into dominio.actividades (id, usuario_id, tipo, titulo)
     values ($1, $2, 'academic_task', 'Actividad')`,
    [activity, owner],
  );
  for (let index = 0; index < 21; index++) {
    const preciseTime = `2026-09-24T12:00:00.${String(index).padStart(6, "0")}Z`;
    await seed.query(
      `insert into dominio.notificaciones
       (id, usuario_id, tipo, actividad_id, referencia_en, creada_en)
       values ($1,$2,'deadline_reminder',$3,$4::timestamptz,$5::timestamptz)`,
      [
        crypto.randomUUID(),
        owner,
        activity,
        `2026-09-25T12:${String(index).padStart(2, "0")}:00Z`,
        preciseTime,
      ],
    );
  }
  runtime = new Pool({ connectionString: url.toString() });
  app = new Hono();
  registerNotificationRoutes(app, {
    getSession: async (headers) => {
      const id = headers.get("x-test-user");
      return id === owner || id === other ? { user: { id } } : null;
    },
    notifications: createNotificationRepository(runtime),
  });
  registerTimeEntryRoutes(app, {
    getSession: async (headers) => {
      const id = headers.get("x-test-user");
      return id === owner || id === other ? { user: { id } } : null;
    },
    timeEntries: createTimeEntryRepository(runtime),
    activities: createActivityRepository(runtime),
    profiles: createProfileRepository(runtime),
  });
});

afterAll(async () => {
  await runtime?.end();
  await seed?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

test("notification cursor preserves PostgreSQL microseconds across pages", async () => {
  expect((await app.request("/v1/notifications")).status).toBe(401);
  const first = await app.request("/v1/notifications", { headers: { "x-test-user": owner } });
  expect(first.status).toBe(200);
  const firstPage = (await first.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(firstPage.items).toHaveLength(20);
  expect(firstPage.nextCursor).not.toBeNull();
  const encoded = JSON.parse(Buffer.from(firstPage.nextCursor ?? "", "base64url").toString()) as {
    createdAt: string;
  };
  expect(encoded.createdAt).toBe("2026-09-24T12:00:00.000001Z");
  const second = await app.request(`/v1/notifications?cursor=${firstPage.nextCursor}`, {
    headers: { "x-test-user": owner },
  });
  const secondPage = (await second.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(secondPage.items).toHaveLength(1);
  expect(secondPage.nextCursor).toBeNull();
  expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size).toBe(21);
  const foreign = await app.request("/v1/notifications", { headers: { "x-test-user": other } });
  expect(((await foreign.json()) as { items: unknown[] }).items).toHaveLength(0);
});

function preciseTime(index: number) {
  return `2026-09-24T12:00:00.${String(index).padStart(6, "0")}Z`;
}

test("time entry cursor preserves PostgreSQL microseconds across pages", async () => {
  for (let index = 0; index < 21; index++) {
    await seed.query(
      `insert into dominio.registros_tiempo
       (id, usuario_id, actividad_id, origen, inicia_en, termina_en,
        creado_en)
       values ($1,$2,$3,'manual',
         '2026-09-24T11:00:00Z'::timestamptz + $5::integer * interval '1 minute',
         '2026-09-24T11:01:00Z'::timestamptz + $5::integer * interval '1 minute',
         $4::timestamptz)`,
      [crypto.randomUUID(), owner, activity, preciseTime(index), index],
    );
  }
  const first = await app.request("/v1/time-entries", { headers: { "x-test-user": owner } });
  const firstPage = (await first.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(firstPage.items).toHaveLength(20);
  const encoded = JSON.parse(Buffer.from(firstPage.nextCursor ?? "", "base64url").toString()) as {
    createdAt: string;
  };
  expect(encoded.createdAt).toBe(preciseTime(1));
  const second = await app.request(`/v1/time-entries?cursor=${firstPage.nextCursor}`, {
    headers: { "x-test-user": owner },
  });
  const secondPage = (await second.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(secondPage.items).toHaveLength(1);
  expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size).toBe(21);
  const foreign = await app.request("/v1/time-entries", { headers: { "x-test-user": other } });
  expect(((await foreign.json()) as { items: unknown[] }).items).toHaveLength(0);
});

test("plan history cursor visits every plan with microsecond timestamps", async () => {
  for (let index = 0; index < 21; index++) {
    await seed.query(
      `insert into dominio.planes
       (id, usuario_id, estado, version_algoritmo, revision_origen,
        fecha_desde, fecha_hasta, sesion_minima, sesion_maxima, maximo_diario, creado_en)
       values ($1,$2,'rejected','test-v1',0,'2026-09-24','2026-09-25',15,60,240,$3::timestamptz)`,
      [crypto.randomUUID(), owner, preciseTime(index)],
    );
  }
  const plans = createPlanRepository(runtime);
  const first = await plans.history(owner, null);
  expect(first).toHaveLength(21);
  expect(first[19]?.cursorCreatedAt).toBe(preciseTime(1));
  const second = await plans.history(owner, {
    createdAt: first[19]?.cursorCreatedAt ?? "",
    id: first[19]?.id ?? "",
  });
  expect(second).toHaveLength(1);
  expect(second[0]?.cursorCreatedAt).toBe(preciseTime(0));
  expect(await plans.history(other, null)).toHaveLength(0);
});

test("admin cursors preserve microseconds for users, documents, audit and roles", async () => {
  await seed.query(
    `UPDATE autenticacion.usuarios SET creado_en = '2026-09-23T12:00:00Z'
     WHERE id IN ($1, $2)`,
    [owner, other],
  );
  for (let index = 0; index < 21; index++) {
    const target = crypto.randomUUID();
    const actor = crypto.randomUUID();
    await seed.query(
      `insert into dominio.documentos_privacidad
       (id, tipo, version, idioma, contenido, creado_en)
       values ($1,'terms',$2,'es','Texto de prueba',$3::timestamptz)`,
      [target, index + 1, preciseTime(index)],
    );
    await seed.query(
      `insert into dominio.auditoria_admin
       (id, actor_id, accion, objetivo_id, registrado_en)
       values ($1,$2,'privacy_document.created',$3,$4::timestamptz)`,
      [crypto.randomUUID(), owner, target, preciseTime(index)],
    );
    await seed.query(
      `insert into autenticacion.usuarios (id, nombre, correo, correo_verificado, creado_en)
       values ($1,'Administrador',$2,false,$3::timestamptz)`,
      [actor, `${actor}@example.test`, preciseTime(index)],
    );
    await seed.query(
      `insert into autenticacion.roles_usuario (usuario_id, rol, asignado_en)
       values ($1,'support',$2::timestamptz)`,
      [actor, preciseTime(index)],
    );
  }
  const repository = createAdminRepository(runtime, "pagination-test-secret");
  const users = await repository.listUsers(null);
  expect(users[19]?.cursorCreatedAt).toBe(preciseTime(1));
  expect(
    await repository.listUsers({
      createdAt: users[19]?.cursorCreatedAt ?? "",
      id: users[19]?.id ?? "",
    }),
  ).toHaveLength(3);
  const documents = await repository.listDocuments(null);
  expect(documents[19]?.cursorCreatedAt).toBe(preciseTime(1));
  expect(
    await repository.listDocuments({
      createdAt: documents[19]?.cursorCreatedAt ?? "",
      id: documents[19]?.id ?? "",
    }),
  ).toHaveLength(1);
  const audits = await repository.listAudit(null);
  expect(audits[19]?.cursorRecordedAt).toBe(preciseTime(1));
  expect(
    await repository.listAudit({
      recordedAt: audits[19]?.cursorRecordedAt ?? "",
      id: audits[19]?.id ?? "",
    }),
  ).toHaveLength(1);
  const roles = await repository.listRoles(null);
  expect(roles[19]?.cursorAssignedAt).toBe(preciseTime(1));
  expect(
    await repository.listRoles({
      assignedAt: roles[19]?.cursorAssignedAt ?? "",
      id: roles[19]?.userId ?? "",
    }),
  ).toHaveLength(1);
});
