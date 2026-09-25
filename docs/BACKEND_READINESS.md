# Estado verificable del backend local

Fecha de revisión: 2026-09-24. Objetivo: terminar el backend del planificador,
según `APP_CONTEXT.md`, `docs/PRODUCT_REQUIREMENTS.md` y
`docs/IMPLEMENTATION_PLAN.md`. Esta revisión distingue implementación local,
verificación en CI y activación para usuarios reales. Ningún resultado local o de
CI valida por sí solo el entorno de producción.

| Etapa | Evidencia actual | Pendiente para cierre real |
|---|---|---|
| 0. Fundaciones | 44 migraciones aplicadas a `notesia_dev`, migración desde cero y restauración cifrada aislada; Problem Details y contratos OpenAPI. El workflow `Backend` pasó completo en GitHub Actions para `4d42417`. | Ningún pendiente de fundación backend identificado en esta revisión. |
| 1. Auth y privacidad | El registro crea una cuenta pendiente sin sesión; el enlace cifrado vence en una hora y toda la app queda bloqueada hasta verificar el correo. También están implementados sesión cifrada y revocable, recuperación, perfil, preferencias, documentos/consentimientos versionados, exportación y eliminación condicionada por política, con pruebas negativas y de acceso cruzado. Un remitente SMTP real entregó la verificación y el retorno abrió la app Android en desarrollo local. | Textos legales aprobados; plazos de eliminación, auditoría y backups; repetir la entrega SMTP en el entorno objetivo. |
| 2. Organización | Periodos, materias, actividades, subtareas, recurrencia, eventos y consultas de agenda por rango con PostgreSQL y pruebas de aislamiento. | Prueba de flujo en dispositivo para las pantallas móviles; fuera del backend. |
| 3. Disponibilidad | Reglas, excepciones, conflictos y capacidad por zona horaria; pruebas con cambios de horario. | Ningún pendiente de código backend identificado en esta revisión. |
| 4. Motor | Planificación determinística, preview, edición, aplicación explícita, historial, bloques bloqueados y riesgo explicado; invariantes y PostgreSQL real. | Ningún pendiente de código backend identificado en esta revisión. |
| 5. Ejecución | Temporizador único, tiempo manual sin solapamiento, progreso, estadísticas semanales y riesgo actual. | Ningún pendiente de código backend identificado en esta revisión. |
| 6. Offline y avisos | Idempotencia, versiones, outbox, avisos internos, horarios silenciosos, dispositivos push cifrados y adaptador FCM con pruebas simuladas. | Cola offline y conflictos visibles pertenecen al cliente móvil; entrega push real requiere proyecto y credenciales FCM. |
| 7. IA | Gateway, cinco casos, tres adaptadores, consentimiento, fallback manual, cuota compartida, proveedor alterno por caso con transición auditada y conciliación de reservas inciertas. | Evaluar modelos, costos y políticas reales antes de habilitar una ruta. No hay conexiones configuradas. |
| 8. Admin | API de roles, cuentas, documentos, proveedores, rutas, pruebas sintéticas, auditoría y salud, protegida con TOTP, reautenticación y rate limit. La primera cuenta administradora local quedó provisionada, verificada y con inicio/cierre de sesión comprobado. | Enrolar TOTP y crear después una sesión nueva; repetir el bootstrap en el entorno objetivo. El panel visual no forma parte del backend. |
| 9. Hardening | El pase actual completó 119 pruebas backend, 5 del núcleo móvil y 19 de interfaz con PostgreSQL local. La API valida host, puerto y periodo de gracia, exige un bind explícito en producción y cierra listener, monitor y ambos pools ante `SIGTERM`/`SIGINT`; una instancia aislada confirmó readiness y salida limpia. La API usa `traceparent` W3C y los spans JSON correlacionan API, PostgreSQL, worker, IA, FCM y SMTP sin contenido privado. El endpoint de salud calcula señales de worker ausente, colas muertas, backlog, proveedor IA indisponible, error sostenido y costo conocido sobre un límite aprobado, y puede entregarlas a un webhook HTTPS firmado. La carga local más reciente dio p95 de 16,8 ms en lista, 45,0 ms en creación y 84,3 ms en preview. | Falta conectar la salida de trazas, aprobar el límite de costo y probar un receptor real, además de validar rendimiento, backup y entrega externa en el entorno objetivo. |

## Estado observado en la base local

`notesia_dev` es PostgreSQL persistente y tiene 44 migraciones. En esta revisión contenía dos
cuentas verificadas —una mediante el flujo externo real y otra mediante el bootstrap administrativo
local— y una pendiente, ningún documento de privacidad publicado, una cuenta con rol `admin`,
ningún proveedor y ninguna ruta de IA. SMTP quedó
configurado solo en el `.env` local; FCM, cifrado de IA y la política de eliminación siguen sin
configurarse. Tampoco están configurados el webhook operativo ni el límite de costo IA. Como el
`.env` local conserva `ALLOW_SIGNUP=true`, la API exige mantener SMTP disponible para aceptar
nuevas cuentas.
Las pruebas que requieren textos
legales usan bases aisladas con contenido sintético y las eliminan al terminar.

El pase actual ejecutó 119 pruebas backend, 5 pruebas del núcleo móvil y 19 pruebas de interfaz,
incluidas las integraciones con PostgreSQL local, sin fallos. También pasaron tipos, lint,
contrato OpenAPI, builds,
auditoría de dependencias y escaneo de secretos en bundles. GitHub Actions repitió
con éxito esos gates, además de la migración desde cero y la restauración cifrada,
en el commit `4d42417`. Estas comprobaciones no validan la red, carga ni servicios
externos del entorno de producción.

La entrega de alertas operativas queda desactivada mientras no se configuren URL,
clave HMAC y origen del despliegue. Su adaptador se probó con respuestas simuladas;
no se ha enviado todavía a un receptor externo real. La señal de costo permanece
desactivada hasta aprobar y configurar `OPS_ALERT_AI_COST_LIMIT_USD_15M`.

## Entradas necesarias para activación

1. Repetir en el entorno objetivo la entrega, el reenvío y el retorno móvil ya
   comprobados con un remitente SMTP real en desarrollo. El destino de verificación
   está fijado al deep link de la app y no crea sesión automáticamente.
2. Enrolar TOTP para la cuenta administradora local y entregar textos aprobados y
   versiones iniciales para términos, privacidad y uso de IA. Publicarlos mediante
   una sesión creada después de activar el segundo factor.
3. Aprobar días de gracia y retención de auditoría, además del tratamiento de
   datos borrados en backups. La eliminación permanece deshabilitada sin esto.
4. Configurar FCM y proveedores de IA mediante el gestor de secretos del entorno
   cuando se vaya a probar su entrega real. No copiar claves a este documento ni
   enviarlas por chat.
5. Indicar entorno objetivo para repetir las pruebas de rendimiento, restauración
   y entrega externa. El resultado local no demuestra comportamiento en producción.

Las señales sostenidas de proveedor, error y costo ya están implementadas y
probadas con datos sintéticos. Su activación necesita el límite de costo aprobado y
un receptor operativo. La verificación de correo, sus restricciones de acceso y la
entrega local real ya están comprobadas; su activación en producción depende de
configurar allí el remitente. Los textos y
plazos aprobados son requisitos de activación, no valores que el repositorio pueda
inventar.
