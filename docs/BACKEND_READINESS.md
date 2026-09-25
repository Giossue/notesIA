# Estado verificable de NotesIA

Fecha de revisión: 2026-09-25. Esta revisión separa implementación, verificación
local y activación en un entorno real. Ningún resultado local valida por sí solo
un servidor de producción.

| Área | Implementación comprobada | Activación pendiente |
|---|---|---|
| Base y contratos | 46 migraciones, migración desde cero, restauración cifrada, Zod, Problem Details y OpenAPI generado. | Repetir migración y restauración en el entorno objetivo con su procedimiento aprobado. |
| Auth y cuenta | Verificación de correo antes de sesión, reenvío, recuperación, sesión revocable, perfil, exportación y eliminación condicionada por política. | SMTP y URL HTTPS del entorno, textos legales y política de retención aprobada. |
| Dominio estudiantil | Periodos, materias, actividades, cancelación, subtareas, recurrencia, eventos y agenda con aislamiento por cuenta. | Ningún pendiente de código identificado. |
| Motor | Disponibilidad, capacidad, planificación determinística, preview editable, historial, riesgo y reprogramación manual. | Ningún pendiente de código identificado. |
| Ejecución | Temporizador, tiempo manual, progreso, comparación estimado/real y estadísticas. | Ningún pendiente de código identificado. |
| Offline y avisos | SQLite cifrado, outbox acotado, idempotencia, conflictos visibles, notificaciones internas y preferencias. | Ningún proveedor push externo: los avisos se consultan dentro de la app. |
| IA | Cinco casos, salida validada, consentimiento, cuotas, tres adaptadores, proveedor alterno auditado, métricas y fallback manual. | Modelos, precios, claves y evaluación real antes de habilitar rutas. |
| Admin | Panel funcional con TOTP, cuentas, roles, privacidad, IA, salud y auditoría. La primera cuenta admin local está provisionada. | Enrolar TOTP y repetir el bootstrap controlado en el entorno objetivo. |
| Operación | Trazas correlacionadas, alertas HTTPS firmadas, lifecycle, rendimiento, backup, escaneo de secretos y CI de toda la aplicación. | Receptor de alertas, colector de logs/trazas, límite de costo y monitoreo del entorno. |
| Móvil nativo | Android debug instalado y probado; Android release compila con tráfico claro desactivado y firma externa; proyecto iOS contiene Keychain, deep link y dictado. | Firma de tiendas y validación iOS con Xcode/hardware Apple. |

## Estado observado en la base local

La base persistente es `127.0.0.1:5432/notesia_dev` y registra 46 migraciones.
Contiene una cuenta administrativa local ya verificada. No hay proveedores ni
rutas de IA habilitados. SMTP está configurado únicamente en el `.env` local;
cifrado de IA, política de eliminación, webhook operativo y límite de
costo siguen sin configurar. Las pruebas de integración crean identidades
sintéticas y las eliminan al terminar.

La migración `0045_cancelacion_actividades.sql` incorpora `cancelled` al historial
de actividad. La operación conserva el progreso, retira la actividad de planes,
riesgo, temporizador y avisos, y permite reactivarla de manera versionada e
idempotente.

La migración `0046_desactivar_push_remoto.sql` elimina registros de dispositivos
push existentes y deja ese canal desactivado. La entrega escogida es el buzón
interno; API, worker y panel se desplegarán posteriormente en Dokploy.

## Evidencia ejecutada

El pase de cierre aprobó:

- 134 pruebas Bun con 2472 aserciones;
- 20 pruebas de interfaz móvil y 2 pruebas unitarias del panel;
- 2 recorridos E2E Playwright del acceso, TOTP y secciones administrativas;
- lint, tipos, contrato OpenAPI y auditoría de dependencias alta;
- builds de API, worker, admin, bundle móvil, Android debug y Android release;
- 46 migraciones desde cero y restauración cifrada de 44 tablas;
- escaneo de 3 bundles contra los valores sensibles configurados;
- carga local p95 de 18,2 ms en lista, 49,8 ms en creación idempotente y
  98,3 ms en preview semanal.

El primer pase de pruebas falló porque dos workers de desarrollo consumían la
misma cola local de la suite. Tras detener esos procesos, la prueba aislada y el
pase completo aprobaron. En CI se usa una base y procesos exclusivos.

## Entradas necesarias para publicar

1. URLs HTTPS finales de API, panel y restablecimiento.
2. Textos legales y plazos de eliminación, auditoría y backups aprobados.
3. Credenciales, modelos y precios de los proveedores IA que se vayan a habilitar.
4. Receptor de alertas, secreto HMAC, origen y límite de costo aprobado.
5. Keystore de carga Android y contraseñas entregadas como secretos
   `NOTESIA_UPLOAD_*`; certificados y perfiles de iOS.
6. Servicios de Dokploy para repetir carga, backup, restauración, SMTP, trazas y
   alertas antes de publicar.

Nunca se deben copiar esas claves a este documento, al chat ni al repositorio.
