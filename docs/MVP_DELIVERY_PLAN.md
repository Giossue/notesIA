# Cierre funcional del MVP

Fecha de revisión: 2026-09-25. El alcance de este cierre es funcional. El trabajo
visual y la identidad final de la interfaz quedan para una etapa posterior.

## Estado por etapa

| Etapa | Estado del código | Evidencia principal |
|---|---|---|
| 0. Fundaciones | Completa | Monorepo, contratos Zod/OpenAPI, Problem Details, PostgreSQL y 45 migraciones desde cero. |
| 1. Cuenta y privacidad | Completa | Registro pendiente, verificación obligatoria, sesión revocable en Keychain/Keystore, recuperación, perfil, consentimientos, exportación y solicitud de eliminación. |
| 2. Organización | Completa | Periodos, materias, actividades, estados, cancelación, subtareas, recurrencia, eventos y agenda diaria/semanal/mensual. |
| 3. Disponibilidad | Completa | Reglas semanales, cruce de medianoche, excepciones, conflictos y capacidad visible. |
| 4. Planificación y riesgo | Completa | Preview determinístico, diferencias, edición validada, bloqueos, trabajo no asignado, aplicación/rechazo e historial. |
| 5. Ejecución | Completa | Temporizador, tiempo manual, progreso, estimado frente a real y estadísticas semanales. |
| 6. Conectividad y avisos | Completa | Caché SQLite cifrada, outbox local acotado, conflictos visibles, avisos internos, preferencias y registro push. |
| 7. IA | Completa en código | Cinco casos acotados, entrada por texto o dictado, confirmación, tres proveedores, alternativa auditada y fallback manual. |
| 8. Administración | Completa | Panel web para TOTP, salud, cuentas, roles, privacidad, proveedores/modelos/rutas de IA, uso y auditoría. |
| 9. Hardening | Completa en código local | Trazas, alertas firmadas, apagado limpio, backup/restauración, rendimiento, escaneo de secretos, builds y gates de CI. |

## Flujos disponibles en el móvil

- Registro, reenvío de verificación, acceso, recuperación y cierre de sesión.
- Perfil, materias, periodos, actividades, subtareas, series y eventos fijos.
- Agenda por día, semana o mes con plazos, eventos y bloques del plan.
- Disponibilidad semanal, excepciones y capacidad.
- Planificación, riesgo, edición de bloques, aplicación, rechazo e historial.
- Temporizador, tiempo manual, progreso y estadísticas.
- Notificaciones, preferencias, privacidad, exportación y eliminación de cuenta.
- Cambios offline para actividades, progreso y tiempo manual, con revisión de
  fallos y conflictos.
- Ayuda de IA con confirmación; el dictado usa el servicio de voz configurado en
  el sistema y conserva únicamente el texto revisado por la persona.

## Flujos disponibles en administración

- Inicio de sesión con cookie HttpOnly y segundo factor obligatorio.
- Enrolamiento TOTP y códigos de respaldo.
- Salud operativa, colas, worker, alertas y consumo de IA.
- Consulta, suspensión y reactivación de cuentas.
- Gestión versionada de roles y publicación de documentos de privacidad.
- Configuración write-only de proveedores, modelos y rutas de IA, incluida prueba
  de conexión y proveedor alterno.
- Auditoría paginada de operaciones sensibles.

## Activación externa pendiente

Estos puntos requieren decisiones o credenciales del entorno y no se resuelven
inventando valores en el repositorio:

1. Aprobar y publicar los textos legales y la política de eliminación/retención.
2. Enrolar TOTP para la cuenta administradora del entorno objetivo.
3. Registrar modelos y credenciales reales para habilitar IA.
4. Instalar la configuración Firebase y credenciales FCM para entrega push real.
5. Configurar el receptor de alertas, el colector de trazas y el límite de costo IA.
6. Crear la clave de firma Android, los perfiles/certificados iOS y las URLs HTTPS
   del despliegue.
7. Compilar y probar iOS en Xcode y hardware Apple; el entorno local disponible
   solo permite validar Android y la sintaxis del proyecto iOS.

## Evidencia del cierre local

- 45 migraciones validadas desde una base vacía y restauración cifrada aislada.
- 100 operaciones Hono y 13 flujos de autenticación documentados en OpenAPI.
- 136 pruebas Bun, 20 pruebas de interfaz móvil, 2 pruebas unitarias del panel y
  2 recorridos Playwright, todos aprobados.
- Lint, tipos, auditoría de dependencias, contratos, builds de API, worker, admin
  y bundle móvil aprobados.
- APK Android `debug` y paquete `release` compilados; el paquete de publicación se
  deja sin firma hasta recibir una clave privada.
- Escaneo de secretos sobre los tres bundles sin hallazgos.
- Rendimiento local dentro de RNF-01/RNF-02 y backup/restauración comprobados.

La evidencia local prueba el código y el entorno descrito. La aceptación de un
despliegue exige repetir entrega externa, rendimiento, backup y restauración en
ese destino.
