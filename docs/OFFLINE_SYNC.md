# Offline y sincronización

## Alcance

El MVP tolera conectividad intermitente; no es completamente offline-first.

## Permitido sin conexión

- leer cache;
- crear/editar actividad;
- eliminar lógicamente una actividad;
- actualizar progreso;
- registrar sesión manual;
- consultar último plan.

## Requiere conexión

- autenticación inicial;
- generar/aplicar plan;
- IA;
- recovery;
- admin.

## Mutación local

```ts
type PendingMutation = {
  clientMutationId: string;
  entity: "activity" | "time_entry" | "progress";
  operation: "create" | "update" | "delete";
  entityId: string;
  baseVersion?: number;
  payload: unknown;
  createdAt: string;
};
```

## Conflictos

- creación con UUID cliente: idempotente;
- texto/fecha: conflicto explícito;
- progreso: no “last write wins” silencioso si ambos cambiaron;
- sesión cerrada: append-only e idempotente;
- plan: no aplicar offline;
- eliminación: `DELETE /v1/activities/:id` crea un tombstone con `version` y
  `mutationId`; el mismo intento devuelve `204` sin duplicar historial.

## Reintentos

- backoff exponencial con jitter;
- respetar `Retry-After`;
- no reintentar 4xx salvo 408/409 según flujo/429;
- mostrar pending y failed;
- no bloquear el resto de la cola por una mutación irreconciliable.

## Seguridad local

- cookie de sesión en Android Keystore/iOS Keychain;
- datos mínimos en SQLite;
- no keys ni contraseña;
- no payloads en logs;
- limpieza al cerrar/eliminar cuenta.
