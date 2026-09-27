import type { Pool } from "pg";

export function createWorkerHealthRepository(pool: Pool) {
  return {
    async beat() {
      await pool.query(
        `INSERT INTO dominio.latido_procesos (id, visto_en) VALUES (true, now())
         ON CONFLICT (id) DO UPDATE SET visto_en = EXCLUDED.visto_en`,
      );
    },
  };
}

export type WorkerHealthRepository = ReturnType<typeof createWorkerHealthRepository>;
