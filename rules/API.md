# Reglas API

- Bun + Hono + Zod/OpenAPI.
- Handler pequeño; caso de uso explícito.
- Repositorio scoped por usuario.
- Mutaciones críticas transaccionales.
- Outbox en la misma transacción.
- Error Problem Details.
- No devolver filas ORM.
- No llamar proveedor externo dentro de transacción.
- Idempotency-Key cuando reintentar duplica.
- `version` para conflictos.
- No confiar en rol del cliente.
- Rate limit en auth, recovery, IA y admin.
- Paginación por cursor.
- Validar fechas, zona, tamaños y enums.
