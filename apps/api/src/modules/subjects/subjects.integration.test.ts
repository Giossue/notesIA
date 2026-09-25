import { afterAll, expect, test } from "bun:test";
import { createProfileRepository, createSubjectRepository } from "@notesia/db";
import { createApp } from "../../app";
import { createAuth } from "../../auth/create-auth";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required for local integration tests");
const testUrl = new URL(sourceUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/notesia_dev"
) {
  throw new Error("Subject integration tests only run against local notesia_dev credentials");
}

const { auth, pool } = createAuth({
  databaseUrl: testUrl.toString(),
  secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
  allowUnverifiedEmailForTests: true,
});
const subjects = createSubjectRepository(pool);
const app = createApp(
  async () => {},
  auth.handler,
  {
    getSession: (headers) => auth.api.getSession({ headers }),
    profiles: createProfileRepository(pool),
  },
  { getSession: (headers) => auth.api.getSession({ headers }), subjects },
);

const emailA = `subject-a-${crypto.randomUUID()}@example.test`;
const emailB = `subject-b-${crypto.randomUUID()}@example.test`;
let cookieA = "";
let cookieB = "";

async function register(email: string, name: string) {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ name, email, password: "SubjectIntegrationPassword2026!" }),
  });
  expect(response.status).toBe(200);
  return {
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    user: ((await response.json()) as { user: { id: string } }).user,
  };
}

afterAll(async () => {
  for (const cookie of [cookieA, cookieB]) {
    if (cookie)
      await app.request("/v1/auth/sign-out", {
        method: "POST",
        headers: { cookie, origin: "http://127.0.0.1:3000" },
      });
  }
  await pool.query("DELETE FROM autenticacion.usuarios WHERE correo IN ($1, $2)", [emailA, emailB]);
  await pool.end();
});

test("subjects are scoped, versioned, idempotent and paginated", async () => {
  const anonymous = await app.request("/v1/subjects");
  expect(anonymous.status).toBe(401);

  const a = await register(emailA, "Estudiante A");
  const b = await register(emailB, "Estudiante B");
  cookieA = a.cookie;
  cookieB = b.cookie;

  const id = crypto.randomUUID();
  const input = { id, name: "Matemáticas", colorToken: "primary" };
  const create = await app.request("/v1/subjects", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(create.status).toBe(201);
  expect(await create.json()).toMatchObject({ id, version: 1 });

  const retry = await app.request("/v1/subjects", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(retry.status).toBe(200);

  const duplicateName = await app.request("/v1/subjects", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ ...input, id: crypto.randomUUID(), name: "  matemáticas " }),
  });
  expect(duplicateName.status).toBe(409);
  expect(await duplicateName.json()).toMatchObject({ code: "SUBJECT_NAME_CONFLICT" });
  // Sin tilde, en mayúsculas o con espacios de más sigue siendo la misma materia.
  for (const variant of ["MATEMATICAS", "matematicas", " Matemáticas\t"]) {
    const clash = await app.request("/v1/subjects", {
      method: "POST",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({ ...input, id: crypto.randomUUID(), name: variant }),
    });
    expect({ variant, status: clash.status }).toEqual({ variant, status: 409 });
  }
  const withCode = await app.request("/v1/subjects", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ ...input, id: crypto.randomUUID(), name: "Física", code: "FIS1" }),
  });
  expect(withCode.status).toBe(422);

  const inaccessible = await app.request(`/v1/subjects/${id}`, { headers: { cookie: cookieB } });
  expect(inaccessible.status).toBe(404);
  const crossUpdate = await app.request(`/v1/subjects/${id}`, {
    method: "PATCH",
    headers: { cookie: cookieB, "content-type": "application/json" },
    body: JSON.stringify({ name: "Ajena", colorToken: "secondary", version: 1 }),
  });
  expect(crossUpdate.status).toBe(404);

  const update = await app.request(`/v1/subjects/${id}`, {
    method: "PATCH",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ name: "Cálculo", colorToken: "secondary", version: 1 }),
  });
  expect(update.status).toBe(200);
  expect(await update.json()).toMatchObject({ name: "Cálculo", version: 2 });

  const stale = await app.request(`/v1/subjects/${id}`, {
    method: "PATCH",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ name: "Viejo", colorToken: "primary", version: 1 }),
  });
  expect(stale.status).toBe(409);

  const archive = await app.request(`/v1/subjects/${id}/archive`, {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ version: 2 }),
  });
  expect(archive.status).toBe(200);
  expect(((await archive.json()) as { archivedAt: string | null }).archivedAt).not.toBeNull();

  const active = await app.request("/v1/subjects", { headers: { cookie: cookieA } });
  expect(((await active.json()) as { items: unknown[] }).items).toHaveLength(0);
  const archived = await app.request("/v1/subjects?archived=true", {
    headers: { cookie: cookieA },
  });
  expect(((await archived.json()) as { items: unknown[] }).items).toHaveLength(1);

  // Archivada, el nombre queda libre; restaurarla choca con la nueva activa.
  const reuseId = crypto.randomUUID();
  const reuse = await app.request("/v1/subjects", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ id: reuseId, name: "cálculo", colorToken: "primary" }),
  });
  expect(reuse.status).toBe(201);
  const blockedRestore = await app.request(`/v1/subjects/${id}/restore`, {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ version: 3 }),
  });
  expect(blockedRestore.status).toBe(409);
  expect(await blockedRestore.json()).toMatchObject({ code: "SUBJECT_NAME_CONFLICT" });
  const archiveReuse = await app.request(`/v1/subjects/${reuseId}/archive`, {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ version: 1 }),
  });
  expect(archiveReuse.status).toBe(200);

  const restore = await app.request(`/v1/subjects/${id}/restore`, {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ version: 3 }),
  });
  expect(restore.status).toBe(200);
  expect(await restore.json()).toMatchObject({ archivedAt: null, version: 4 });

  const otherSubject = await app.request("/v1/subjects", {
    method: "POST",
    headers: { cookie: cookieB, "content-type": "application/json" },
    body: JSON.stringify({ ...input, id: crypto.randomUUID() }),
  });
  expect(otherSubject.status).toBe(201);

  // El nombre se guarda con espacios simples y la comparación los ignora.
  const spaced = await app.request("/v1/subjects", {
    method: "POST",
    headers: { cookie: cookieB, "content-type": "application/json" },
    body: JSON.stringify({ ...input, id: crypto.randomUUID(), name: "  Física   Moderna " }),
  });
  expect(spaced.status).toBe(201);
  const spacedBody = (await spaced.json()) as { id: string; name: string; version: number };
  expect(spacedBody.name).toBe("Física Moderna");
  const spacedClash = await app.request("/v1/subjects", {
    method: "POST",
    headers: { cookie: cookieB, "content-type": "application/json" },
    body: JSON.stringify({ ...input, id: crypto.randomUUID(), name: "fisica moderna" }),
  });
  expect(spacedClash.status).toBe(409);

  await Promise.all(
    Array.from({ length: 21 }, (_, number) =>
      subjects.create(a.user.id, crypto.randomUUID(), {
        name: `Materia ${number}`,
        colorToken: "tertiary",
      }),
    ),
  );
  const firstPage = await app.request("/v1/subjects", { headers: { cookie: cookieA } });
  const page1 = (await firstPage.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(page1.items).toHaveLength(20);
  expect(page1.nextCursor).toBeTruthy();
  const secondPage = await app.request(`/v1/subjects?cursor=${page1.nextCursor}`, {
    headers: { cookie: cookieA },
  });
  const page2 = (await secondPage.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(page2.items).toHaveLength(2);
  expect(page2.nextCursor).toBeNull();
  expect(new Set([...page1.items, ...page2.items].map((item) => item.id)).size).toBe(22);
});
