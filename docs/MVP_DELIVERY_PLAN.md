# Plan para terminar el MVP local

## Punto de partida

La app React Native CLI compila para Android y usa una API Bun/Hono conectada a
`notesia_dev`. Better Auth permite cuenta y sesión; el perfil, las materias y las
actividades tienen persistencia, autorización y control de versión. La agenda diaria
consulta eventos fijos y fechas límite reales según la zona horaria del perfil. La navegación principal
usa una barra inferior flotante. Las subtareas ya se guardan bajo cada actividad y
permiten editar, completar, archivar y restaurar. Los eventos fijos se pueden crear,
editar, archivar y restaurar con autorización y control de versión. El backend ya
guarda consentimientos y planes; faltan sus flujos móviles. La interfaz se ha renderizado en Android con Metro 8082; los flujos
completos de actividades aún requieren una prueba de dispositivo.

## Regla de entrega

Cada hito cierra un flujo real: pantalla móvil → contrato → API con autorización →
PostgreSQL local → pruebas. Debe mostrar carga, vacío, error, falta de red y reintento.
No se da por terminado con datos simulados. Se ejecutan lint, tipos, pruebas y build;
los flujos críticos se prueban en Android.

## Hitos, en orden

| Hito | Resultado comprobable | Cierre mínimo |
|---|---|---|
| 0. Fundaciones | Esquema Drizzle, migraciones, errores API uniformes y CI. | Base limpia y base con migraciones; API y móvil construyen. |
| 1. Cuenta y privacidad | Registro, inicio/cierre, sesión segura, perfil y consentimientos versionados. | Sesión revocable; acceso sin sesión denegado; documentos aprobados antes de admitir usuarios reales. |
| 2. Organización manual | Materias, actividades, subtareas, eventos y agenda diaria/semanal. | Crear y editar desde Android; datos persistidos y aislados por usuario. |
| 3. Disponibilidad | Ventanas semanales, excepciones y conflictos. | Capacidad visible y solapamientos detectados. |
| 4. Planificación y riesgo | Motor determinístico, preview editable, aplicar explícitamente e historial. | Invariantes y concurrencia probadas; el usuario ve trabajo sin ubicar. |
| 5. Ejecución | Temporizador, tiempo manual, progreso y estadísticas básicas. | Sesión única por usuario; estimado frente a real. |
| 6. Conectividad y avisos | Caché, cola offline acotada, idempotencia, conflictos y notificaciones. | Mutaciones aceptadas no se pierden; conflictos visibles; reintentos seguros. |
| 7. IA y administración | Gateway con consentimiento, fallback, configuración y auditoría. | Funciones manuales siguen operativas sin proveedores; claves nunca vuelven al cliente. |
| 8. Cierre | Accesibilidad, seguridad, rendimiento, backup/restauración y E2E. | Criterios del MVP y definición de terminado cumplidos. |

## Avance backend local (2026-09-24)

Las migraciones `0009` a `0043` añadieron disponibilidad, planes, tiempo real,
progreso, preferencias, periodos académicos, idempotencia de reintentos y un outbox
para avisos internos al aplicar un plan, documentos versionados, consentimientos y
correos cifrados para recuperación de acceso, rol administrativo, publicación
auditada de documentos, TOTP y configuración cifrada de IA. La migración `0039`
ordena de forma persistente los consentimientos y da prioridad a revocaciones
anteriores cuando hay marcas de tiempo iguales. La migración `0040` impide que dos
registros de tiempo de una misma cuenta se solapen,
incluida una sesión abierta. Los registros previos con solapamientos deben
revisarse antes de aplicar esa migración; no se corrigen automáticamente.
El backend calcula
capacidad en la zona horaria del perfil, admite vista previa editable, aplicación
explícita e historial, y rechaza propuestas obsoletas mediante una revisión de las
fuentes. Repetir la aplicación de un mismo borrador confirma el plan activo sin
duplicar el evento del outbox. Las actividades admiten eliminación lógica con
historial y reintento por `mutationId`; una edición idéntica repetida también
confirma la versión ya guardada. Las sesiones cerradas, el tiempo manual y el progreso reducen el trabajo
pendiente sin descontarse dos veces al generar un plan; las nuevas vistas previas
se identifican como `deterministic-v2`. El worker recalcula el riesgo actual
tras cambios de las fuentes y cada 15 minutos para el plan activo; solo emite
alertas con la revisión vigente. El riesgo original sigue en el historial. El plan activo expone
`isStale` y la revisión actual para que el cliente pueda pedir una nueva propuesta.
`GET /v1/risk-assessments`
recalcula el riesgo actual sin crear un plan, después de cambios en progreso, tiempo,
actividades o disponibilidad. Las estadísticas semanales incluyen completadas,
plazos vencidos y porcentaje de entregas a tiempo, además de tiempo por materia.
Se añadieron pruebas de acceso cruzado y una prueba de migración
desde cero; CI valida auditoría de dependencias de severidad alta, lint, tipos,
restauración cifrada en una base aislada, pruebas de API y worker y sus builds.
Una prueba integral del backend usa otra base aislada para recorrer registro,
consentimientos sintéticos, plan aplicado, outbox, tiempo, riesgo y revocación de IA.
Una prueba HTTP adicional verifica `401`
en más de 90 rutas privadas sin sesión, `403` en las 16 rutas administrativas para
un estudiante y acceso entre cuentas a materias, actividades, avisos y
dispositivos. La autenticación también comprueba que una sesión vencida deja de
acceder a rutas privadas. La API aplica `no-store` y `nosniff` a `/v1`. CI escanea los
bundles del backend para evitar que valores sensibles configurados se incluyan
literalmente. La API correlaciona `X-Request-Id` con Problem Details y emite
latencia y estado HTTP en JSON sin rutas ni contenido privado; el worker emite
contadores de trabajo y errores de ciclo sin el texto de la excepción. La API
también acepta y devuelve `traceparent` W3C. Los spans de nombres cerrados
correlacionan API, consultas PostgreSQL, outbox, recuperación, push y proveedores;
las colas guardan solo los identificadores opacos necesarios para continuar la
traza entre procesos. No incluyen SQL, parámetros, cuerpos ni respuestas externas.
La API también puede sondear las señales agregadas de worker, colas y resultados
de IA de los 15 minutos anteriores. Detecta indisponibilidad de proveedor, tasa
de error sostenida y costo conocido por encima de un límite aprobado. El costo
desconocido se informa por separado y no activa un valor inventado. Las alertas se
entregan a un webhook HTTPS con firma HMAC, idempotencia, resolución y repetición
acotada; no hay un receptor real ni límite de costo configurados. El gateway de IA
tiene cinco casos acotados, tres
adaptadores probados con respuestas simuladas,
consentimiento vigente, presupuesto y fallback manual; ningún proveedor ni modelo
real está configurado. La reserva de cuota incluye mensaje, esquema, prompt y
salida máxima; una prueba concurrente verifica el límite por usuario entre casos.
Las explicaciones de riesgo y replanificación toman sus
métricas del plan guardado, con aislamiento por usuario. La gestión de roles usa
versión, reautenticación, auditoría y límite de frecuencia por administrador.
La API administrativa consulta consumo y costo estimado de IA agregado por caso,
proveedor y estado en rangos UTC de hasta 31 días, sin identidades ni contenido
privado. También muestra duración media, p95 y solicitudes sin medición por grupo.
El costo usa tarifas configuradas y uso reportado; muestra cuánto queda
sin valorar y no inventa un total cuando faltan datos. El gateway también registra
las respuestas manuales por caso y motivo, incluidas las que no llamaron a un proveedor.
El worker identifica reservas de IA abandonadas como resultado incierto, sin
devolver sus tokens al presupuesto cuando la llamada pudo haberse facturado.
También expone el estado de PostgreSQL y los contadores de trabajos pendientes,
listos, en curso y fallidos de outbox, push y recuperación. El worker escribe un
latido por ciclo; la API expone cuándo se vio por última vez y si fue reciente.
Las cuentas se listan con cursor y pueden suspenderse o reactivarse con versión,
contraseña y auditoría. Suspender revoca sesiones; un nuevo inicio queda bloqueado
hasta la reactivación.
La exportación propia transmite JSON por partes, con contraseña actual y sin secretos.
Una prueba operativa crea un respaldo cifrado de la base local y lo restaura en una
base aislada, sin tocar producción.
Una carga HTTP reproducible sobre `notesia_dev` midió p95 máximos en tres
ejecuciones de 13,9 ms para lista de materias, 36,9 ms para creación idempotente
y 90,2 ms para preview semanal
en el escenario descrito en `docs/PERFORMANCE_LOCAL.md`. La primera ejecución
reveló un bloqueo de conexiones entre la transacción idempotente y Better Auth;
ahora usan pools separados. Queda repetir la prueba con carga y red del entorno
objetivo antes de aceptar rendimiento de producción.
El worker crea avisos internos de plazo, bloque próximo y riesgo alto; las
preferencias de anticipación y enfriamiento son privadas y versionadas. Una alerta
de riesgo alto puede repetirse después del enfriamiento sin duplicarse en ejecuciones
concurrentes, y una nueva transición a alto permite otro aviso. Las horas
silenciosas usan la zona horaria del perfil. El backend push cifra tokens, encola
por dispositivo y tiene un adaptador FCM HTTP v1 probado con respuestas simuladas;
faltan proyecto, credenciales y prueba de entrega real en Android.
El límite del lote se aplica después de descartar candidatos en horas silenciosas,
para que no bloqueen avisos elegibles de otras cuentas.
La inserción también vuelve a comprobar el horario y la zona del perfil bajo
bloqueos de lectura, para respetar cambios concurrentes ya confirmados.
El programador confirma al insertar que la actividad aún está pendiente y que el
plan del bloque sigue activo, evitando recordatorios obsoletos tras un cambio
concurrente.
Una prueba con PostgreSQL confirma que una respuesta tardía `unregistered` no
borra un dispositivo cuyo token se renovó durante el envío; el aviso se reintenta
con el token vigente.
Otra prueba confirma que el worker vuelve a leer canal y token después de reclamar
el trabajo: un opt-out confirmado antes de FCM suprime el envío y una renovación
previa usa el token nuevo.
El canal push se desactiva por separado del buzón interno mediante una preferencia
persistente. El worker descarta los envíos ya pendientes si el usuario apaga push;
cambiar solo avisos no vuelve obsoleto el plan.
Las claves de idempotencia tienen arrendamiento renovable para recuperar intentos
abandonados. En las rutas cubiertas por `Idempotency-Key`, la escritura mediante
los repositorios API y la respuesta guardada se confirman en una sola transacción.
Una prueba fuerza un fallo antes del commit y verifica el rollback del recurso y
el reintento con la misma clave.
Los reintentos de respuestas `204` conservan el mismo estado sin ejecutar de nuevo
la mutación.
Los cursores de avisos, tiempo, historial y administración preservan la precisión
de PostgreSQL; una prueba con 21 filas por lista evita saltos entre páginas.
El worker retira en lotes las claves de idempotencia y los registros de sesión
caducados, conservando los vigentes.
Las respuestas de error de las rutas API usan Problem Details, incluidos los
errores de autenticación, validación y rutas desconocidas. La eliminación de cuenta
ya tiene solicitud, cancelación y purga probadas en una base aislada; sigue
desactivada hasta aprobar la política de retención.
La exportación JSON incluye preferencias de avisos, rol y suspensión, riesgos
actuales, referencias de avisos, metadatos de dispositivos y estado de eliminación,
sin tokens ni datos de otra cuenta. El programador vuelve a comprobar en PostgreSQL
la preferencia general al insertar un aviso, incluso si cambió durante la búsqueda.
La entrega de `plan.applied` también bloquea la preferencia al insertar, para que
apagar avisos durante el procesamiento no deje una notificación posterior.
El archivo OpenAPI se genera desde las 99 operaciones Hono explícitas y sus
validadores Zod; incluye las once operaciones de autenticación permitidas por la
API. CI comprueba que ninguna ruta Hono nueva ni cambio en el filtro de Better
Auth quede sin descripción y que el archivo esté actualizado. Las rutas
delegadas no permitidas devuelven `404`; las respuestas HTTP especiales se
revisan por separado.
La recurrencia básica genera en una transacción hasta 60 actividades diarias o
semanales con fechas locales y plazo al final del día; cada instancia se puede
editar de forma independiente. Las series se consultan con cursor y sus
instancias se filtran por `seriesId`.
Falta la
experiencia móvil de esos flujos.

## Próxima entrega

1. Configurar un remitente SMTP real y la pantalla HTTPS de restablecimiento; el
   token, expiración y revocación de sesiones ya tienen prueba de integración.
   Falta la prueba de sesión vencida y restauración en Android.
2. Aprobar los textos definitivos de términos y privacidad antes de registrar
   usuarios reales. La ruta de publicación ya exige TOTP y una sesión nueva. Falta
   provisionar el rol inicial y la interfaz administrativa. Las pruebas usan una base local
   aislada.
3. Verificar en Android los flujos completos de actividades. Los errores API usan
   Problem Details, la migración desde base vacía y CI ya existen.
4. Añadir las pantallas móviles de vista semanal, disponibilidad, planes y registro
   de tiempo. Integrar la cola offline del cliente con las claves de idempotencia,
   los conflictos de versión y los avisos ya expuestos por el backend.
5. Aprobar y habilitar la política de eliminación de cuenta; el flujo de backend
   está probado y desactivado hasta entonces. Completar la entrega push real,
   evaluación de costo con modelos reales y pruebas de rendimiento y seguridad.

## Límites actuales

- Android es el dispositivo de prueba local disponible. La compatibilidad iOS se
  revisará con un entorno de Apple antes de declararla terminada.
- Los identificadores de modelos, credenciales de IA y textos legales no se inventan.
- Ninguna migración se aplica a `calidad_software` ni a un servidor remoto. Se verifica
  siempre la conexión objetivo antes de migrar.
