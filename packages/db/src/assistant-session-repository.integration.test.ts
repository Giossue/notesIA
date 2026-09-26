import { afterAll, expect, test } from "bun:test";
import { Pool } from "pg";
import {
  ASSISTANT_SESSION_LIMIT,
  createAssistantSessionRepository,
} from "./assistant-session-repository";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for assistant session tests");
const target = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Assistant session tests only run against local notesia_dev");

const pool = new Pool({ connectionString: source, max: 2 });
const sessions = createAssistantSessionRepository(pool);
const userId = crypto.randomUUID();

afterAll(async () => {
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [userId]);
  await pool.end();
});

test("one active session, turns are appended up to the limit and old sessions stay closed", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba chat', $2, true)`,
    [userId, `chat-${userId}@example.test`],
  );
  const first = await sessions.active(userId);
  expect(first).toMatchObject({ content: [], userMessages: 0 });
  expect((await sessions.active(userId)).id).toBe(first.id);

  const actionId = crypto.randomUUID();
  const at = new Date().toISOString();
  expect(
    await sessions.appendTurn(userId, first.id, [
      { id: crypto.randomUUID(), role: "user", text: "Tengo examen el viernes", at },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Te propongo crearlo.",
        actions: [{ id: actionId, action: { type: "create_activity" }, state: "pending" }],
        at,
      },
    ]),
  ).toBe(1);
  expect(await sessions.setActionState(userId, actionId, "applied")).toBe(true);
  const stored = await sessions.active(userId);
  expect(stored.content[1]?.actions?.[0]?.state).toBe("applied");

  // Al llegar al límite ya no se agregan turnos.
  await pool.query("UPDATE dominio.sesiones_asistente SET mensajes_usuario = $2 WHERE id = $1", [
    first.id,
    ASSISTANT_SESSION_LIMIT,
  ]);
  expect(await sessions.appendTurn(userId, first.id, [])).toBeNull();

  // Una conversación nueva cierra la anterior, que queda guardada.
  const second = await sessions.startNew(userId);
  expect(second.id).not.toBe(first.id);
  expect(second.userMessages).toBe(0);
  const rows = await pool.query<{ estado: string }>(
    "SELECT estado FROM dominio.sesiones_asistente WHERE usuario_id = $1 ORDER BY creado_en",
    [userId],
  );
  expect(rows.rows.map((row) => row.estado)).toEqual(["closed", "active"]);
});
