import { afterAll, expect, test } from "bun:test";
import { Pool } from "pg";
import { createAssistantSuggestionRepository } from "./assistant-suggestion-repository";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for suggestion tests");
const target = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Suggestion tests only run against local notesia_dev");

const pool = new Pool({ connectionString: source, max: 2 });
const suggestions = createAssistantSuggestionRepository(pool);
const adminId = crypto.randomUUID();
const text = `Prueba de sugerencia ${crypto.randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await pool.query(
    "DELETE FROM dominio.sugerencias_asistente WHERE texto LIKE 'Prueba de sugerencia%'",
  );
  // La auditoría es inmutable: sus filas de prueba se conservan, como en las demás pruebas.
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [adminId]).catch(() => {});
  await pool.end();
});

test("la app recibe 3 sugerencias activas al azar y el panel las gestiona con auditoría", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin sugerencias', $2, true)`,
    [adminId, `suggestions-${adminId}@example.test`],
  );
  expect(await suggestions.random(3)).toHaveLength(3);

  const created = await suggestions.create(adminId, { text, active: false });
  if (created.kind !== "created") throw new Error("no se creó");
  expect(await suggestions.create(adminId, { text, active: true })).toEqual({ kind: "duplicate" });
  // Oculta: nunca sale en la app.
  for (let round = 0; round < 5; round++) expect(await suggestions.random(50)).not.toContain(text);

  const updated = await suggestions.update(adminId, created.row.id, {
    text,
    active: true,
    version: created.row.version,
  });
  expect(updated).toMatchObject({ kind: "updated", row: { active: true, version: 2 } });
  expect(
    await suggestions.update(adminId, created.row.id, { text, active: false, version: 1 }),
  ).toEqual({ kind: "version_conflict" });
  expect(await suggestions.random(100)).toContain(text);

  expect(await suggestions.remove(adminId, created.row.id)).toBe(true);
  const audit = await pool.query<{ accion: string }>(
    "SELECT accion FROM dominio.auditoria_admin WHERE actor_id = $1 ORDER BY registrado_en",
    [adminId],
  );
  expect(audit.rows.map((row) => row.accion)).toEqual([
    "assistant_suggestion.created",
    "assistant_suggestion.updated",
    "assistant_suggestion.deleted",
  ]);
});
