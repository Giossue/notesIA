# Plan de implementación

## Etapa 0 — Fundaciones

- monorepo y workspaces Bun;
- TypeScript estricto;
- lint, format, typecheck, tests y build;
- API health/readiness;
- PostgreSQL, Drizzle y migraciones;
- contratos Zod/OpenAPI;
- CI y observabilidad mínima.

**Salida:** todos los proyectos construyen y despliegan un esqueleto.

## Etapa 1 — Auth, perfil y privacidad

- registro/login/logout/recovery;
- sesión móvil y admin;
- perfil/preferencias;
- documentos y consentimientos;
- pruebas de acceso horizontal/vertical.

**Salida:** usuario autenticado con zona horaria y elección sobre IA.

## Etapa 2 — Materias, actividades y agenda

- periodos/materias;
- actividades/subtareas;
- horas ocupadas del horario;
- agenda/calendario;
- historial.

**Salida:** gestor manual útil sin planificación automática.

## Etapa 3 — Disponibilidad

- reglas semanales;
- excepciones;
- validación de intervalos;
- visualización de capacidad.

**Salida:** el sistema conoce huecos reales.

## Etapa 4 — Motor determinístico

- intervalos;
- recurrencia;
- trabajo restante;
- ranking;
- chunking;
- asignación;
- riesgo;
- preview/edit/apply;
- invariantes y pruebas de propiedad.

**Salida:** plan viable sin IA.

## Etapa 5 — Ejecución y estadísticas

- temporizador;
- registro manual;
- progreso;
- estimado vs real;
- estadísticas;
- recalcular riesgo.

**Salida:** ciclo planificar → ejecutar → medir → ajustar.

## Etapa 6 — Offline y notificaciones

- SQLite/cache;
- outbox local;
- idempotencia/versionado;
- conflictos;
- buzón de notificaciones internas;
- outbox servidor/worker;
- horas silenciosas.

## Etapa 7 — IA acotada

- gateway/adaptadores;
- configuración por caso;
- extracción;
- estimación;
- explicación;
- desglose;
- evaluación, costo y fallback.

**Regla:** no comenzar antes de que el motor determinístico sea correcto.

## Etapa 8 — Admin

- usuarios;
- proveedores/modelos/rutas;
- test de conexión;
- usage y auditoría;
- documentos de privacidad;
- system health.

## Etapa 9 — Hardening y release

- threat model;
- accesibilidad;
- rendimiento;
- backups/restauración;
- E2E;
- publicación;
- monitoreo y respuesta a incidentes.

## Regla anti-feature-creep

Una función post-MVP solo entra si:

1. existe evidencia del problema;
2. tiene métrica de éxito;
3. no duplica capacidad;
4. su costo operativo es conocido;
5. no degrada privacidad;
6. tiene feature spec y, si cambia arquitectura, ADR.
