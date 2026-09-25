# Estado verificable del backend local

Fecha de revisión: 2026-09-24. Objetivo: terminar el backend del planificador,
según `APP_CONTEXT.md`, `docs/PRODUCT_REQUIREMENTS.md` y
`docs/IMPLEMENTATION_PLAN.md`. Esta revisión distingue implementación local de
activación para usuarios reales. No afirma una ejecución de CI remoto ni valida el
entorno de producción.

| Etapa | Evidencia actual | Pendiente para cierre real |
|---|---|---|
| 0. Fundaciones | 43 migraciones aplicadas a `notesia_dev`, migración desde cero y restauración cifrada aislada; Problem Details y contratos OpenAPI. El workflow `Backend` pasó completo en GitHub Actions para `040ea0c`. | Ningún pendiente de fundación backend identificado en esta revisión. |
| 1. Auth y privacidad | Registro, sesión cifrada y revocable, recuperación, perfil, preferencias, documentos/consentimientos versionados, exportación y eliminación condicionada por política; pruebas negativas y de acceso cruzado. | Verificación de correo para acciones sensibles; textos legales aprobados; plazos de eliminación, auditoría y backups; SMTP real. |
| 2. Organización | Periodos, materias, actividades, subtareas, recurrencia, eventos y consultas de agenda por rango con PostgreSQL y pruebas de aislamiento. | Prueba de flujo en dispositivo para las pantallas móviles; fuera del backend. |
| 3. Disponibilidad | Reglas, excepciones, conflictos y capacidad por zona horaria; pruebas con cambios de horario. | Ningún pendiente de código backend identificado en esta revisión. |
| 4. Motor | Planificación determinística, preview, edición, aplicación explícita, historial, bloques bloqueados y riesgo explicado; invariantes y PostgreSQL real. | Ningún pendiente de código backend identificado en esta revisión. |
| 5. Ejecución | Temporizador único, tiempo manual sin solapamiento, progreso, estadísticas semanales y riesgo actual. | Ningún pendiente de código backend identificado en esta revisión. |
| 6. Offline y avisos | Idempotencia, versiones, outbox, avisos internos, horarios silenciosos, dispositivos push cifrados y adaptador FCM con pruebas simuladas. | Cola offline y conflictos visibles pertenecen al cliente móvil; entrega push real requiere proyecto y credenciales FCM. |
| 7. IA | Gateway, cinco casos, tres adaptadores, consentimiento, fallback manual, cuota compartida, proveedor alterno por caso con transición auditada y conciliación de reservas inciertas. | Evaluar modelos, costos y políticas reales antes de habilitar una ruta. No hay conexiones configuradas. |
| 8. Admin | API de roles, cuentas, documentos, proveedores, rutas, pruebas sintéticas, auditoría y salud, protegida con TOTP, reautenticación y rate limit. | Designar y provisionar la primera cuenta administradora; el panel visual no forma parte del backend. |
| 9. Hardening | 110 pruebas backend pasaron en el último pase completo con PostgreSQL local; el último pase móvil conserva 16. La API usa `traceparent` W3C y los spans JSON correlacionan API, PostgreSQL, worker, IA, FCM y SMTP sin contenido privado; outbox, correo y push conservan el enlace entre procesos. El endpoint de salud calcula señales de worker ausente, colas muertas y backlog, y puede entregarlas a un webhook HTTPS firmado. La carga local más reciente dio p95 de 16,8 ms en lista, 45,0 ms en creación y 84,3 ms en preview. | Faltan señales de proveedor caído, costo anormal y error sostenido; falta conectar la salida de trazas y probar un receptor real, además de validar rendimiento, backup y entrega externa en el entorno objetivo. |

## Estado observado en la base local

`notesia_dev` es PostgreSQL persistente y tiene 43 migraciones. En esta revisión contenía una
cuenta, ningún documento de privacidad publicado, ninguna cuenta con rol `admin`,
ningún proveedor y ninguna ruta de IA. Las variables de SMTP, FCM, cifrado de IA y
política de eliminación no estaban configuradas. Las pruebas que requieren textos
legales usan bases aisladas con contenido sintético y las eliminan al terminar.

El pase actual ejecutó 110 pruebas backend, incluidas las integraciones con
PostgreSQL local, sin fallos. También pasaron tipos, lint, contrato OpenAPI, builds,
auditoría de dependencias y escaneo de secretos en bundles. GitHub Actions repitió
con éxito esos gates, además de la migración desde cero y la restauración cifrada,
en el commit `040ea0c`. Estas comprobaciones no validan la red, carga ni servicios
externos del entorno de producción.

La entrega de alertas operativas queda desactivada mientras no se configuren URL,
clave HMAC y origen del despliegue. Su adaptador se probó con respuestas simuladas;
no se ha enviado todavía a un receptor externo real.

## Entradas necesarias para activación

1. Decidir si el correo verificado se exige antes de iniciar sesión o para las
   acciones sensibles indicadas en `docs/SECURITY_AND_PRIVACY.md`, y aprobar el
   destino HTTPS del enlace de verificación.
2. Entregar textos aprobados y versiones iniciales para términos, privacidad y
   uso de IA. Publicarlos mediante una cuenta administradora designada.
3. Aprobar días de gracia y retención de auditoría, además del tratamiento de
   datos borrados en backups. La eliminación permanece deshabilitada sin esto.
4. Configurar SMTP, FCM y proveedores de IA mediante el gestor de secretos del
   entorno cuando se vaya a probar su entrega real. No copiar claves a este
   documento ni enviarlas por chat.
5. Indicar entorno objetivo para repetir las pruebas de rendimiento, restauración
   y entrega externa. El resultado local no demuestra comportamiento en producción.

Las señales sostenidas de proveedor, error y costo son el siguiente trabajo de
observabilidad que no requiere textos ni claves reales para diseñarse y probarse.
El flujo de verificación de correo y sus
restricciones de acceso dependen de la decisión solicitada. Los textos y plazos
aprobados son requisitos de activación, no valores que el repositorio pueda inventar.
