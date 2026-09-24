# Instrucciones obligatorias para agentes

## Misión

Construir el planificador estudiantil respetando dominio, arquitectura, privacidad y control del usuario. No se busca producir más código ni agregar IA a cada pantalla. Se busca comportamiento útil, predecible y comprobable.

## Antes de modificar código

1. Leer `APP_CONTEXT.md`, `ARCHITECTURE.md` y la regla específica del área.
2. Identificar requisito, flujo, entidad y contrato afectados.
3. Revisar ADR aplicables.
4. Consultar documentación oficial antes de usar una API no confirmada.
5. Escribir un plan breve: archivos, migración, pruebas, riesgos y rollback.
6. Preferir un cambio vertical pequeño.

## Límites no negociables

- No conectar clientes directamente a la base de datos.
- No exponer secrets, tokens privados ni claves de proveedores.
- No usar IA para autorización, validación, cálculo temporal, conflicto, fechas límite o transacciones.
- No aplicar automáticamente una recomendación o replanificación.
- No crear chatbots genéricos, asistentes flotantes o “insights” decorativos.
- No crear componentes gigantes, servicios dios, repositorios universales o wrappers sin valor.
- No introducir otro kit de UI móvil además de React Native Paper.
- No almacenar contraseñas, refresh tokens, API keys o push tokens en texto plano.
- No registrar tokens, claves, prompts completos ni contenido privado.
- No dejar mocks permanentes presentados como implementación real.
- No hardcodear modelos llamados “latest”.

## Fronteras

- `apps/mobile`: experiencia del estudiante.
- `apps/admin`: administración, soporte y configuración.
- `apps/api`: auth, autorización, casos de uso, contratos y motor.
- `apps/worker`: outbox, notificaciones, IA y procesos diferidos.
- `packages/contracts`: DTO y validadores compartidos; nunca modelos ORM.
- `packages/domain`: lógica determinística pura.
- `packages/db`: esquema, migraciones y persistencia.
- `packages/config`: configuración validada.
- `packages/observability`: logging, métricas y trazas.

## API

- Prefijo `/v1`.
- JSON; instantes ISO 8601 en UTC.
- Validación con Zod.
- Error uniforme tipo Problem Details.
- Autorización en servidor y alcance por `user_id`.
- Idempotencia en mutaciones reintentables.
- Control optimista con `version`.
- Paginación por cursor.
- No serializar filas ORM directamente.

## Móvil

- React Native Paper como único kit.
- TanStack Query para estado de servidor.
- Zustand solo para estado local efímero.
- React Hook Form + Zod.
- Almacén seguro del sistema operativo para la sesión móvil (Android Keystore/iOS Keychain).
- Ninguna pantalla hace `fetch` directamente.
- Toda pantalla contempla carga, vacío, error, sin conexión y reintento.
- Accesibilidad: etiquetas, tamaño de texto, contraste y objetivos táctiles.

## Admin

- React + shadcn/ui.
- Sesión mediante cookie segura HttpOnly.
- Operaciones sensibles con confirmación y auditoría.
- Las claves de IA son write-only: después de guardarse no se devuelven.

## IA

- Toda llamada pasa por `AiGateway`.
- Cada caso de uso tiene esquema, prompt versionado, timeout, presupuesto y fallback manual.
- Toda salida se valida.
- Los datos enviados se minimizan.
- El contenido del modelo se trata como no confiable.
- La explicación puede narrar métricas del motor, pero no alterarlas.
- No se guarda razonamiento interno.

## Pruebas

- Lógica pura: unitarias e invariantes.
- Repositorios/API: integración con PostgreSQL real de prueba.
- Móvil: React Native Testing Library.
- Admin: Testing Library + Playwright.
- Flujos críticos móviles: Maestro o equivalente aprobado.
- Adaptadores externos: fixtures/servidores simulados.
- Seguridad: acceso no autenticado, rol incorrecto y acceso cruzado.

## Definición mínima de terminado

Un cambio está terminado cuando:

- cumple criterios de aceptación;
- valida y autoriza;
- maneja error, vacío y conectividad;
- tiene pruebas adecuadas;
- no filtra secretos ni PII;
- actualiza contrato, migración y documentación;
- pasa lint, tipos, pruebas y build;
- no deja deuda crítica, mock permanente ni feature decorativa.

Cuando falte una decisión, no inventar. Proponer la opción mínima coherente y solicitar aprobación si es irreversible o afecta seguridad.
