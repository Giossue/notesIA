# Reglas de base de datos

- PostgreSQL 16+.
- Migraciones compartidas son inmutables.
- FK/constraints para invariantes locales.
- Índices según consultas reales.
- `timestamptz` para instantes.
- `jsonb` no sustituye relaciones centrales.
- Secrets nunca en texto plano.
- Auditoría/consentimiento append-only.
- Expandir → migrar → contraer.
- Pruebas con PostgreSQL real.
- Toda consulta personal incluye `user_id`.
- No usar cascade que elimine auditoría/legal sin revisión.
