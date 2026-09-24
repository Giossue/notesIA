# Contribución

## Flujo

1. Issue/feature spec.
2. Rama pequeña.
3. Contrato/migración cuando aplica.
4. Implementación vertical.
5. Pruebas.
6. PR con checklist.

El repositorio final debe exponer comandos equivalentes a:

```bash
bun install
bun run lint
bun run typecheck
bun run test
bun run build
```

Los comandos reales se definen al inicializar el monorepo. No añadir comandos ficticios a CI.
