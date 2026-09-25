# Student Planner AI Context

> MVP funcional implementado en `apps/mobile`, `apps/api`, `apps/worker` y
> `apps/admin`. El diseño visual final queda para la siguiente etapa. Instrucciones
> en [Desarrollo local](docs/LOCAL_DEVELOPMENT.md) y estado verificable en
> [Cierre funcional](docs/MVP_DELIVERY_PLAN.md).

Contexto técnico y funcional para desarrollar una aplicación móvil de planificación estudiantil con API separada, panel administrativo y funciones de IA acotadas.

## Propósito

La aplicación debe ayudar al estudiante a responder:

1. ¿Qué debo hacer?
2. ¿Cuándo puedo hacerlo de forma realista?
3. ¿Alcanza el tiempo antes de cada fecha límite?
4. ¿Qué debe reajustarse cuando cambia el día?

El núcleo no es un chatbot. El núcleo es un motor verificable que relaciona actividades, disponibilidad, eventos fijos, estimaciones, progreso, bloques de trabajo y riesgo.

## Stack de referencia

- **Móvil:** React Native CLI, Metro, TypeScript y React Native Paper.
- **API:** Bun, Hono, Zod y OpenAPI.
- **Base de datos:** PostgreSQL y Drizzle ORM.
- **Autenticación:** Better Auth con sesiones revocables protegidas en PostgreSQL local.
- **Admin:** Bun, Vite, React, shadcn/ui, TanStack Router y TanStack Query.
- **Estado remoto:** TanStack Query.
- **Formularios:** React Hook Form + Zod.
- **IA:** gateway de servidor con adaptadores para OpenAI, Anthropic y DeepSeek.
- **Procesamiento diferido:** transactional outbox + worker. Redis puede utilizarse para colas/caché, nunca como fuente de verdad.

## Lectura recomendada

1. `AGENTS.md`
2. `APP_CONTEXT.md`
3. `ARCHITECTURE.md`
4. `DATABASE_SCHEMA.md`
5. `docs/IMPLEMENTATION_PLAN.md`
6. Reglas específicas de `rules/`

## Jerarquía de fuente de verdad

1. ADR aceptado.
2. `APP_CONTEXT.md` y `DATABASE_SCHEMA.md`.
3. Contrato OpenAPI y esquemas compartidos.
4. `AGENTS.md` y reglas.
5. Código y pruebas.

Una contradicción no se resuelve silenciosamente. Se documenta y se corrige la fuente de mayor prioridad.

## Contenido

```text
student-planner-ai-context/
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── APP_CONTEXT.md
├── ARCHITECTURE.md
├── DATABASE_SCHEMA.md
├── database/schema.sql
├── contracts/openapi.yaml
├── docs/
│   ├── PRODUCT_REQUIREMENTS.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── SECURITY_AND_PRIVACY.md
│   ├── TEST_STRATEGY.md
│   ├── OFFLINE_SYNC.md
│   ├── AI_GATEWAY.md
│   ├── OBSERVABILITY.md
│   ├── OFFICIAL_SOURCES.md
│   └── decisions/
├── rules/
├── workflows/
├── templates/
├── .agents/skills/
├── .codex/instructions.md
└── .github/copilot-instructions.md
```

## Restricciones esenciales

- Móvil y admin nunca acceden directamente a PostgreSQL.
- Las claves de OpenAI, Anthropic y DeepSeek nunca llegan al cliente.
- React Native Paper es el único kit externo de componentes para móvil.
- shadcn/ui se usa en el panel administrativo.
- La planificación, los permisos, los conflictos y el riesgo no dependen de un LLM.
- Toda replanificación se muestra como vista previa antes de aplicarse.
- La aplicación funciona manualmente aunque todos los proveedores de IA estén deshabilitados.
- Cada cambio debe ser pequeño, verificable y probado.

## Desarrollo rápido

En este equipo, el entorno completo puede abrirse en una ventana de Kitty con
una pestaña por proceso:

```bash
./iniciar-notesia-local.sh
```

El lanzador prepara la base, inicia API, worker, admin y Metro, y espera el
dispositivo Android para instalar y abrir la app. La ejecución manual sigue
disponible desde la raíz, usando una terminal distinta para cada proceso:

```bash
bun run dev:api
bun run dev:worker
bun run dev:admin
bun run dev:mobile
```

- Panel administrativo: `http://127.0.0.1:5173/login`.
- API: `http://127.0.0.1:3000/v1`.
- Metro móvil: puerto `8082`.

Las credenciales de SMTP, proveedores IA, firma móvil y alertas se guardan fuera
del repositorio. El despliegue previsto usa Dokploy; la validación actual es local.
