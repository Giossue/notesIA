# Desarrollo local

La app React Native CLI usa una API Bun/Hono conectada a PostgreSQL local. El cliente móvil nunca
se conecta directamente a la base.

## Base de datos

- Instancia verificada: PostgreSQL en `127.0.0.1:5432`.
- Base de desarrollo: `notesia_dev`.
- Rol de ejecución: `notesia_app`, sin privilegios de superusuario.
- El `DATABASE_URL` local está en `.env`, fuera del control de versiones. `.env.example`
  muestra solo el formato.
- `database/schema.sql` sigue siendo una referencia; la primera migración ejecutable
  es `packages/db/migrations/0001_auth.sql`.
- Nombres de esquemas, tablas y columnas en español. Better Auth se configura con
  `modelName`/`fields` para usar `autenticacion.usuarios`, `autenticacion.cuentas`,
  `autenticacion.verificaciones` y `autenticacion.almacen_seguro`. Las sesiones se
  guardan cifradas y con clave HMAC; no se crea tabla de sesiones.
- La base local persistente es `notesia_dev`. Las pruebas de integración corren contra
  ella y limpian los usuarios de prueba que crean. La prueba de migración desde cero
  crea y elimina una base local aislada; no sustituye `notesia_dev`.

La creación de la base y del rol fue manual para este equipo. En otro equipo, crear una
base dedicada y un rol con permiso de conexión; después completar `.env` con esos datos.
Para desarrollo local, `.env` contiene `NODE_ENV=development`; el valor
predeterminado de registro es cerrado. `ALLOW_SIGNUP=true` requiere además
`SMTP_HOST` y `SMTP_FROM`, porque cada alta debe verificar el correo antes de
crear una sesión. `BETTER_AUTH_SECRET` es local y privado.

La API escucha solo en `127.0.0.1:3000` por defecto. En producción exige declarar
`API_HOST` explícitamente; un contenedor servido por un proxy normalmente usa
`API_HOST=0.0.0.0`. `PORT` acepta un puerto TCP válido y
`API_SHUTDOWN_GRACE_SECONDS` controla, entre 1 y 60 segundos, cuánto espera el
servidor a las conexiones activas antes de cerrarlas. Ante `SIGTERM` o `SIGINT`,
la API detiene el monitor operativo, deja de aceptar conexiones y cierra sus dos
pools de PostgreSQL.

Los scripts de migración y restauración aceptan directamente solo PostgreSQL en
loopback, puerto 5432 y la base esperada. GitHub Actions usa un contenedor de servicio,
cuya dirección vista por PostgreSQL no es loopback. En ese entorno el workflow marca
la base efímera con el identificador del run; los scripts aceptan la excepción solo
cuando `CI`, `GITHUB_ACTIONS`, el formato del marcador y el comentario de la base
coinciden. Un marcador ausente o distinto conserva el rechazo del destino.

Las migraciones se aplican como administrador **solo** a
`127.0.0.1:5432/notesia_dev`. El script comprueba el destino, ejecuta todo en una
transacción, verifica el hash de cada archivo y registra lo aplicado en
`public.migraciones`:

```bash
bun run db:migrate:local
bun run db:test:migrations:local
bun run db:test:restore:local
bun run test:performance:local
```

`db:test:restore:local` cifra un volcado de `notesia_dev`, prueba que una clave
equivocada falla, lo restaura en una base local aislada, comprueba migraciones y
tablas y elimina el archivo y la base de prueba. Para crear un respaldo duradero,
guardar `BACKUP_ENCRYPTION_KEY` de 32 bytes en base64 fuera del repositorio y usar
`bun run db:backup:local /ruta/segura/notesia.enc`. El archivo se crea con modo
`0600`; el volcado nunca se escribe en claro. Solo acepta la base local verificada.
`test:performance:local` mide por HTTP el p95 de lista, creación idempotente y
preview con una carga sintética y limpia su usuario al terminar. La metodología
y el último resultado están en `docs/PERFORMANCE_LOCAL.md`.

Las migraciones `0001` a `0007` crearon autenticación, perfil, materias, actividades,
subtareas y eventos fijos con nombres en inglés; `0008` renombra esquemas, tablas,
columnas, índices, restricciones y trigger al español sin tocar datos. `0009` a `0017`
añaden disponibilidad, planes, tiempo real, progreso, preferencias, periodos,
claves de idempotencia, outbox, avisos internos y revisión
transaccional de sus fuentes. El rol
`notesia_app` solo tiene uso de los esquemas y operaciones sobre sus tablas. El perfil
se crea dentro de la misma transacción que el usuario Better Auth mediante el trigger
`usuarios_perfil_creado`.
`0023` añade proveedores de IA con clave cifrada, rutas por caso y uso auditado sin
guardar prompts ni respuestas. `AI_ENCRYPTION_KEY` debe contener 32 bytes aleatorios
en base64 para configurar proveedores; se conserva fuera del repositorio y se respalda
junto con la base, porque perderla impide descifrar las claves ya configuradas.
`0024` añade versión a roles y exige reautenticación en las mutaciones de rol y
configuración de IA. El primer administrador se provisiona fuera de la API.
`0025` añade preferencias versionadas de avisos y notificaciones internas de plazo,
bloque y riesgo. El worker comprueba anticipación, estado activo, zona horaria,
horas silenciosas y enfriamiento; los avisos de plazo y bloque tienen índices
únicos. Si todo el
intervalo de anticipación cae dentro de horas silenciosas, el aviso puede no
emitirse. La aplicación consulta estos avisos desde el buzón interno.
`0026` conserva el esquema histórico de dispositivos y envíos push. Ese canal no
forma parte del despliegue elegido: el cliente no registra dispositivos, la API no
acepta tokens y el worker no carga un proveedor externo.
`0027` añade arrendamientos renovables a las claves de idempotencia. Un intento
abandonado se puede reclamar después de dos minutos; el propietario anterior no
puede completar la respuesta cuando pierde el arrendamiento.
`0028` añade solicitud, cancelación, purga y auditoría de eliminación de cuenta.
La migración no borra cuentas existentes; las rutas y el worker quedan inactivos
hasta configurar la política aprobada en ambas aplicaciones.
`0029` añade series finitas de actividades. `POST /v1/activity-series` acepta una
recurrencia diaria o semanal entre dos fechas locales inclusivas (máximo 366 días
y 60 instancias), usa la zona horaria del perfil y genera todas las actividades
en una transacción. `GET /v1/activity-series` pagina las series propias;
`GET /v1/activities?seriesId=...` devuelve sus instancias. Cada instancia se
edita por separado. La serie original es inmutable y un reintento con su mismo ID
y contenido devuelve la serie creada; otro contenido devuelve conflicto.
No existe generación indefinida ni edición masiva retroactiva.
`0030` indexa el tiempo de uso de IA para agregados administrativos acotados a
31 días UTC. `0031` añade suspensión versionada de cuentas y paginación por fecha
de creación. `GET /v1/admin/users` y `PUT /v1/admin/users/:userId/suspension`
exigen rol admin y TOTP reciente; la mutación pide origen, contraseña y confirmación.
La suspensión revoca sesiones y bloquea nuevos inicios hasta reactivar.
`0032` guarda el último latido del worker para el panel de salud; cada ciclo lo
actualiza aunque no haya trabajos disponibles.
`0033` permite repetir una alerta de riesgo una vez vencido el enfriamiento.
El worker serializa por evaluación activa y vuelve a comprobar la revisión antes de
crear cada alerta; los índices de plazo y bloque siguen evitando sus duplicados.
`0034` registra el evento `deleted` en el historial de actividades. La API marca
`eliminado_en` sin romper referencias históricas; las consultas de agenda y el
planificador excluyen esa actividad.
`0035` guarda una evaluación de riesgo actual separada de `riesgos_plan`, que es
el historial inmutable del plan. El worker la recalcula al cambiar la revisión
de actividades, tiempo, disponibilidad o eventos y, sin cambios, cada 15 minutos
mientras haya un plan activo. Los avisos de riesgo usan esa evaluación si coincide
con la revisión actual; una nueva entrada a nivel alto puede generar otro aviso
incluso durante el enfriamiento del nivel alto anterior. Antes del primer cálculo
se puede usar el riesgo del plan aplicado si sus fuentes siguen vigentes. Un
horizonte vencido no produce riesgo actual ni aviso nuevo. La migración no borra
planes ni avisos existentes; su rollback requiere intervención manual porque
eliminaría evaluaciones ya usadas por avisos.
`0036` guarda precios de entrada y salida por millón de tokens USD en cada ruta
de IA y copia esos precios a cada uso nuevo. El costo usa aritmética decimal;
las filas históricas sin precios conservan costo desconocido. Su rollback manual
se niega cuando ya existen precios configurados o registros de uso.
`0037` registra respuestas manuales del gateway de IA sin identidad ni contenido;
el panel las agrega por caso y motivo. El rollback manual se niega si hay eventos.
`0038` añade la preferencia histórica `push_habilitado`. El buzón interno sigue
guardándose en PostgreSQL cuando los avisos están habilitados. El programador
vuelve a comprobar los avisos generales al insertar cada aviso, incluso si se
desactivaron durante su búsqueda.
`0043` añade continuidad de trazas a outbox, correos de recuperación y envíos
push mediante dos identificadores opacos validados. Las columnas son anulables
para conservar trabajos existentes. La API responde un `traceparent` W3C y API y
worker emiten spans JSON de nombres cerrados sin SQL, parámetros ni contenido
privado. La operación y el rollback están descritos en `docs/OBSERVABILITY.md`.
`0044` crea la cola cifrada de correos de verificación con expiración, reintentos
acotados y continuidad de traza. El rol de la app no puede borrar sus filas; el
worker elimina el enlace cifrado al entregar, vencer o agotar reintentos. Su
rollback manual se niega mientras exista cualquier registro.
`0045` permite registrar la transición `cancelled` en el historial de actividades.
Cancelar conserva el progreso y reactivar recupera `in_progress` cuando corresponde.
La migración solo amplía la restricción del historial y no transforma datos.
`0046` desactiva el canal push externo y elimina los tokens cifrados históricos.
Las tablas se conservan para que la migración sea compatible con instalaciones
existentes; no se exponen en la aplicación ni se procesan desde el worker.
El worker purga por lotes las sesiones y los contadores caducados del almacén
seguro, además de las claves de idempotencia vencidas. Una prueba de integración
verifica que conserva las filas aún vigentes.

## Ejecutar

### Inicio rápido con Kitty

Para levantar todo el entorno local con una sola orden:

```bash
./iniciar-notesia-local.sh
# Equivalente:
bun run dev:kitty
```

El lanzador comprueba `.env`, Bun, Kitty, PostgreSQL, Android SDK y JDK 17; instala
dependencias si faltan, aplica las migraciones locales pendientes y rechaza puertos
ocupados para evitar procesos duplicados. Después abre una ventana de Kitty con
cinco pestañas: API, worker, admin, Metro y Android. La última espera un teléfono
USB autorizado, configura `adb reverse`, compila de forma incremental e instala y
abre `ec.notesia.planner`. Si aún no conectaste el teléfono, las otras cuatro
pestañas continúan funcionando.

Para comprobar los requisitos sin abrir ninguna ventana:

```bash
./iniciar-notesia-local.sh --check
```

Cerrar la ventana **NotesIA local** detiene sus procesos. PostgreSQL sigue siendo
el servicio local compartido del sistema.

### Inicio manual

Desde la raíz del proyecto:

```bash
bun install
bun run dev:api
```

En otra terminal, iniciar el worker de avisos internos:

```bash
bun run dev:worker
```

En otra terminal, iniciar el panel administrativo:

```bash
bun run dev:admin
```

El acceso local queda en `http://127.0.0.1:5173/login`. Definir
`ADMIN_ORIGIN=http://127.0.0.1:5173` en `.env`; Vite envía `/v1` a la API local.
La cuenta administradora debe completar TOTP y crear una sesión posterior para
abrir las secciones protegidas.

En otra terminal, iniciar Metro en el puerto 8082:

```bash
bun run dev:mobile
```

Si la terminal ya está en `apps/mobile`, el comando equivalente es `bun run start`.
`dev:mobile` solo existe en el `package.json` de la raíz.

En una tercera terminal, con el dispositivo Android conectado por USB, instalar y abrir la app nativa:

```bash
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8082 tcp:8082
cd apps/mobile
JAVA_HOME=/usr/lib/jvm/java-17-openjdk bun run android
```

Después de la instalación inicial, Metro recarga los cambios de JavaScript. La API local
se configura en `apps/mobile/src/core/config/api.ts`. El puerto 8082 evita interferir
con la otra app de Metro en 8081. La app usa el paquete Android `ec.notesia.planner`.

Comprobaciones:

```bash
bun run lint
bun run contracts:check
bun run typecheck
bun run test
bun run test:admin:e2e
bun run build
bun run test:bundle-secrets
(cd apps/mobile/android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a)
(cd apps/mobile/android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a -PNOTESIA_API_BASE_URL=https://api.example.invalid/v1)
```

Antes de ejecutar la suite de integración local, detener cualquier instancia de
`dev:worker`: el worker consume deliberadamente las mismas colas persistentes que
las pruebas verifican. CI usa una base y procesos exclusivos.

`contracts/openapi.yaml` se genera con `bun run contracts:generate` a partir de
las 100 rutas explícitas de Hono y los esquemas Zod. También describe las trece
operaciones de autenticación permitidas, incluidas verificación de correo,
renovación de códigos de respaldo y rotación de TOTP. `contracts:check` compara el archivo con
el código y falla si una ruta Hono o el filtro de Better Auth cambian sin actualizar su
contrato. Las restricciones cruzadas y respuestas de autenticación se validan
además mediante las pruebas de integración. Otras rutas de Better Auth, como
`update-user` y `delete-user`, devuelven `404`: los cambios de perfil pasan por
la ruta versionada y la eliminación por una solicitud con auditoría.

## Alcance actual

`GET /v1/health` verifica el proceso API y `GET /v1/ready` verifica también la base.
Todas las respuestas `/v1` llevan `Cache-Control: no-store` y
`X-Content-Type-Options: nosniff`. La prueba de seguridad HTTP recorre más de 90
rutas privadas sin sesión y las 16 rutas administrativas con una sesión de
estudiante; también comprueba acceso entre cuentas a trabajo y avisos, y que la
ruta histórica de registro de dispositivos permanece deshabilitada. Se ejecuta dentro
de `bun run test` con cuentas sintéticas que se eliminan al terminar.
Tras construir API y worker, `test:bundle-secrets` busca los valores sensibles
configurados en ambos bundles y, si existe, en el bundle móvil. Solo informa el
nombre de la variable si detecta una filtración; CI ejecuta este gate después
de los builds del backend.

La API puede enviar las señales agregadas de salud a un receptor HTTPS mediante
`OPS_ALERT_WEBHOOK_URL`, `OPS_ALERT_WEBHOOK_SECRET` y `OPS_ALERT_SOURCE`. Las tres
variables son obligatorias para activarlo. La clave contiene 32 bytes en base64 y
se conserva fuera del repositorio. El destino no admite credenciales, query ni
fragmento en la URL. Por defecto la API consulta PostgreSQL cada 30 segundos y
repite una condición activa cada 15 minutos; ambos intervalos se pueden acotar con
las variables mostradas en `.env.example`. No se envían usuarios, payloads, SQL,
URLs internas ni excepciones: solo el origen del despliegue, estado, fecha y los
códigos de alerta con su cola o proveedor. Además del latido y las colas, la API
agrega los resultados de IA de los 15 minutos anteriores. Señala un proveedor
indisponible desde cinco fallos de transporte sin éxitos y una tasa de error
sostenida desde diez resultados con al menos 50 % de errores. La alerta de costo
conocido solo se activa al definir el límite aprobado en
`OPS_ALERT_AI_COST_LIMIT_USD_15M`; las solicitudes sin costo calculado se informan
por separado y no se estiman.

El cuerpo exacto se firma con HMAC-SHA256 en `X-NotesIA-Signature` y cada entrega
incluye `Idempotency-Key`. El receptor debe verificar la firma antes de interpretar
JSON, deduplicar esa clave y responder con `2xx`; un fallo se reintenta en el
siguiente sondeo sin cambiar el identificador. Una primera lectura saludable no
genera tráfico. Una transición a estado saludable envía una instantánea
`resolved`. Varias réplicas pueden intentar el mismo evento y por eso la
deduplicación del receptor forma parte del contrato operativo.

El móvil ofrece los flujos funcionales del MVP: cuenta, perfil, privacidad,
periodos, materias, actividades y estados, subtareas, recurrencia, eventos, agenda
diaria/semanal/mensual, disponibilidad, planes, riesgo, tiempo, estadísticas,
notificaciones, preferencias, cuenta, sincronización offline e IA. La barra
principal enlaza Inicio, Agenda, Actividades, Materias y Perfil; Herramientas da
acceso al resto. La cookie se guarda en Android Keystore/iOS Keychain y SQLite
usa una clave aleatoria guardada en el almacén seguro. Al cerrar sesión, cambiar
de cuenta o detectar una sesión vencida se limpian la caché y los datos privados.
El flujo se renderizó y recorrió en un Android físico con Metro 8082.

## Integraciones nativas del móvil

Los cambios en Kotlin, Objective-C++, permisos, SQLite o Keychain exigen
recompilar e instalar la aplicación; Metro solo actualiza JavaScript. El dictado
solicita el micrófono al pulsar su botón. Android intenta reconocimiento local y
puede usar el servicio de voz configurado por el sistema si falta el paquete del
idioma. iOS usa `SFSpeechRecognizer`. NotesIA no guarda audio: conserva el texto
que la persona revisa antes de enviarlo a la función de IA.

NotesIA no integra un proveedor de notificaciones push del sistema operativo. Los
avisos se guardan en PostgreSQL y aparecen dentro de la pantalla Notificaciones al
consultar la API. Dokploy alojará API, worker, panel y PostgreSQL cuando se prepare
el entorno remoto; durante la validación actual todos los procesos son locales.

La variante Android `release` nunca usa el keystore de depuración. Para firmarla,
entregar por variables de entorno o propiedades privadas de Gradle los cuatro
valores siguientes:

```text
NOTESIA_UPLOAD_STORE_FILE
NOTESIA_UPLOAD_STORE_PASSWORD
NOTESIA_UPLOAD_KEY_ALIAS
NOTESIA_UPLOAD_KEY_PASSWORD
```

Sin esos valores, Gradle crea un APK release sin firma para validar la compilación.
Una configuración parcial falla de forma explícita. Los archivos `*.jks` y
`*.keystore` están excluidos del repositorio. El manifiesto release desactiva el
tráfico HTTP. `NOTESIA_API_BASE_URL` es obligatoria al compilar release, debe usar
HTTPS y terminar exactamente en `/v1`. El valor `example.invalid` del comando de
verificación solo valida el build y se reemplaza por la URL desplegada al publicar.

El proyecto iOS toma la misma variable desde el ajuste
`NOTESIA_API_BASE_URL`: Debug usa loopback y Release exige definir la URL HTTPS en
Xcode o en su configuración privada. Requiere macOS, Xcode y `pod install` para
validar enlace, firma, notificaciones y dictado. En Linux se validan TypeScript,
plist y referencias del proyecto, pero no se declara un build iOS aprobado.

## Disponibilidad y planes en API

- `DELETE /v1/activities/:id` recibe `{version, mutationId}` en JSON y devuelve
  `204`. Es una eliminación lógica versionada: la misma mutación se puede reintentar;
  otras versiones o mutaciones reciben conflicto o recurso no encontrado. Repetir
  `PATCH /v1/activities/:id` con idénticos campos y la versión anterior devuelve
  el estado confirmado si ninguna otra edición intervino.

- `GET/POST /v1/availability-rules`, `PATCH /v1/availability-rules/:id` y acciones
  `archive`/`restore`. `weekday` usa 1 = lunes a 7 = domingo. `startMinute` y
  `endMinute` son minutos locales desde el inicio del día; un `endMinute` mayor que
  1440 representa una ventana que cruza medianoche.
- `GET /v1/availability-exceptions?from=...&through=...` y
  `PUT /v1/availability-exceptions/:date`. `windows: []` reemplaza la disponibilidad
  del día por ninguna. `version: null` crea, una versión positiva reemplaza.
- `GET /v1/availability/capacity?from=...&through=...` entrega huecos UTC después de
  descontar eventos fijos. `through` es exclusivo y el rango máximo es 31 días.
- `GET /v1/calendar-events?from=...&through=...` y
  `GET /v1/activities?dueFrom=...&dueThrough=...` consultan la agenda por rango con cursor.
- `GET/POST/PATCH /v1/academic-periods` y acciones `archive`/`restore` gestionan
  periodos opcionales. Las materias aceptan `periodId` de la misma cuenta.
- `POST /v1/plans/preview` requiere UUID de la propuesta y horizonte. Usa las
  preferencias guardadas si no se envían `minSessionMinutes`, `maxSessionMinutes`
  y `maxDailyMinutes`. `PATCH /v1/plans/:id/blocks/:blockId`
  mueve o bloquea un bloque. `DELETE /v1/plans/:id/blocks/:blockId` con `{version}`
  quita un bloque desbloqueado del borrador y recalcula trabajo no asignado y riesgo;
  `POST /v1/plans/:id/apply` aplica expresamente con `version`.
  Repetir `apply` con la versión del borrador ya aplicado devuelve el plan activo
  sin crear otro evento de outbox.
  `GET /v1/plans/active`, `GET /v1/plans/history` y `GET /v1/plans/:id` consultan versiones.
  El plan activo informa `sourceRevision`, `currentSourceRevision` e `isStale` para
  mostrar cuándo sus fuentes cambiaron sin alterar el historial guardado.
  Si cambian actividades, eventos, disponibilidad o perfil, aplicar una propuesta previa
  devuelve `409` y exige generar otra.
- `GET /v1/risk-assessments?from=...&through=...` recalcula el riesgo con las fuentes
  actuales y las preferencias. Conserva los bloques bloqueados solo si el plan activo
  sigue vigente para esa revisión, rango y límites. No crea otra versión del plan.
  `through` es exclusivo y el rango máximo es 31 días.
- El plan descuenta del estimado los minutos de sesiones cerradas y registros manuales.
  El progreso parcial se registra con historial y versión; el estimado restante se
  calcula con tiempo real para evitar contar ambos indicadores dos veces.

## Registro de tiempo en API

- `POST /v1/time-entries/start` inicia una sesión con tiempo del servidor. Solo puede
  haber una abierta por usuario. `POST /v1/time-entries/:id/stop` la cierra con
  `version` y `mutationId`; repetir exactamente el cierre devuelve la misma sesión.
- `POST /v1/time-entries/manual` añade minutos con UUID del cliente y fecha de fin.
  `GET /v1/time-entries/active` devuelve `{ "item": null }` si no hay sesión abierta.
- `GET /v1/time-entries` pagina registros; `GET /v1/time-entries/statistics?from=...&through=...`
  agrega segundos por semana local y materia, además de actividades completadas,
  plazos vencidos y entregas a tiempo por semana local. `onTimePercent` divide
  entregas a tiempo entre plazos transcurridos; es `null` si no hubo plazos.
  El rango máximo es 31 días, con `through` exclusivo.
- `PATCH /v1/activities/:id/progress` actualiza el porcentaje de 0 a 100 con
  `version` y `mutationId`, incluyendo historial y transición de estado.
- Al planificar, el trabajo restante toma el menor valor entre la estimación
  pendiente según progreso y según tiempo registrado; no resta ambos valores
  acumulativamente. Una actividad sin minutos pendientes no recibe riesgo actual.
  El worker recalcula el riesgo de un plan activo tras cambiar las fuentes; los
  avisos esperan la evaluación de la nueva revisión. El historial del plan no
  se modifica.
- `GET/PATCH /v1/me/preferences` consulta y actualiza límites de sesión,
  notificaciones y horas silenciosas con control de versión. `notificationsEnabled`
  controla los avisos del buzón. El contrato todavía devuelve el campo histórico
  `pushNotificationsEnabled` para clientes anteriores, siempre desactivado en la
  configuración actual. Los avisos y la preferencia se guardan en PostgreSQL.

## Idempotencia de mutaciones

Las rutas privadas de mutación admitidas aceptan `Idempotency-Key` como UUID. El servidor
guarda durante 24 horas la respuesta JSON de la primera solicitud y la devuelve
en reintentos con el mismo usuario, método, ruta y cuerpo. Reutilizar la clave con
otra solicitud devuelve `409`. Las rutas de autenticación, sugerencias de IA,
administración, consentimientos, exportación y solicitud de eliminación quedan
fuera de este mecanismo. En administración se vuelven a comprobar rol, MFA,
origen y reautenticación en cada intento, aunque se envíe la misma clave.
Las respuestas `204` exitosas también se guardan y se reproducen sin cuerpo; esto
permite repetir, por ejemplo, la eliminación de una actividad tras perder la
respuesta de red.
El repositorio expone purga de claves vencidas para el worker operativo.
En las rutas cubiertas por `Idempotency-Key`, los repositorios de la API y el
registro de la respuesta comparten una transacción PostgreSQL. Las transacciones
internas de los repositorios usan savepoints. Si falla el registro de la respuesta,
también se revierte la mutación; si la transacción se confirmó pero se perdió la
respuesta HTTP, el reintento la recupera. Si el proceso cae antes de confirmar,
la clave queda pendiente hasta que venza su arrendamiento de dos minutos y el
reintento puede ejecutar la mutación de nuevo. Las rutas excluidas y las peticiones
sin clave conservan sus propias reglas de reintento y versión.

Los cursores de avisos, registros de tiempo, historial de planes y listas
administrativas conservan los microsegundos de PostgreSQL. El JSON de los recursos
sigue usando instantes ISO 8601 en UTC; el cursor es opaco para el cliente.

La API devuelve `X-Request-Id` en `/v1`; para Problem Details coincide con
`requestId` del cuerpo. El proceso API emite eventos JSON de duración y estado
HTTP por área permitida, sin URL completa, query, cuerpo, identidad ni cabeceras.
El worker emite eventos JSON al procesar trabajo o fallar un ciclo, con duración
y contadores por tipo de trabajo; omite el mensaje de la excepción para no filtrar
datos privados. Los ciclos vacíos no generan un evento por cada sondeo.

## Avisos internos

Aplicar un plan guarda `plan.applied` en `dominio.bandeja_salida` dentro de la misma
transacción que activa la nueva versión. `apps/worker` reclama eventos pendientes
con `FOR UPDATE SKIP LOCKED`, crea una notificación interna una sola vez y reintenta
con backoff hasta diez intentos. Al entregar `plan.applied`, lee y bloquea la
preferencia general dentro de la transacción: una desactivación concurrente
confirmada antes de la entrega impide crear el aviso. El programador del worker crea avisos de plazo,
bloque y riesgo alto según preferencias y horario local. `GET /v1/notifications`
lista el buzón paginado y `POST /v1/notifications/:id/read` marca leído con control
de versión. El worker conserva exclusivamente los avisos internos; no intenta una
entrega push externa.
La selección descarta candidatos en horas silenciosas antes de limitar el lote,
para que esos candidatos no retrasen avisos elegibles de otras cuentas.
La inserción vuelve a comprobar las horas silenciosas y bloquea brevemente las
preferencias y la zona horaria del perfil: un cambio confirmado durante la búsqueda
impide crear un aviso con la configuración anterior.
Al insertar recordatorios de plazo o bloque, el worker vuelve a comprobar y bloquear
la actividad y el plan: una actividad ya terminada o un plan reemplazado no genera
un aviso seleccionado previamente.

## Recuperación de contraseña

La API expone `POST /v1/auth/request-password-reset` con `{ "email": "..." }`
y `POST /v1/auth/reset-password` con `{ "token": "...", "newPassword": "..." }`.
La solicitud devuelve la misma respuesta exista o no el correo. El token vence en
15 minutos, se consume una sola vez y el cambio revoca las sesiones existentes.

Para habilitar el envío, configurar `PASSWORD_RESET_URL` (pantalla HTTPS que lee
el parámetro `token`), `SMTP_HOST` y `SMTP_FROM` tanto en API como en worker.
Opcionales: `SMTP_PORT` (587 por defecto), `SMTP_SECURE` (`true` para 465),
`SMTP_USER` y `SMTP_PASSWORD` juntos, y `SMTP_TLS_SERVERNAME` si se conecta por IP.
El worker exige TLS o STARTTLS y recibe el mismo `BETTER_AUTH_SECRET` que la API.
Sin esa configuración, la recuperación permanece deshabilitada. No registrar el
enlace ni el token; el outbox lo guarda cifrado y borra su contenido tras entregar
o agotar los reintentos. Si el worker cae después de entregar un correo, puede
reenviarlo al recuperar el trabajo, pero el token mantiene un único uso.

## Registro y verificación de correo

Con `ALLOW_SIGNUP=true`, la API exige `SMTP_HOST` y `SMTP_FROM` tanto en API como
en worker. El registro crea la cuenta con `correo_verificado=false`, responde sin
token ni cookie y encola un enlace cifrado que vence en una hora. Hasta verificar,
el inicio de sesión responde `EMAIL_NOT_VERIFIED`, las rutas privadas responden
`401` y cualquier sesión creada antes de aplicar esta política deja de autorizar.

El enlace apunta a `GET /v1/auth/verify-email` y usa el retorno fijo
`notesia://email-verified`, declarado en los proyectos nativos Android e iOS. La
verificación no crea sesión: la persona vuelve a la pantalla de acceso e inicia
sesión con su contraseña. `POST /v1/auth/send-verification-email` permite reenviar;
su respuesta no distingue entre una dirección inexistente, pendiente o ya
verificada. No registrar correo, URL ni token. El worker borra el contenido cifrado
después de entregar, vencer o agotar cinco intentos.

`PASSWORD_RESET_URL` sigue siendo opcional y habilita además la recuperación de
contraseña con el mismo transporte SMTP. Sin SMTP, la API solo puede arrancar con
el registro cerrado. Para una prueba real queda configurar un remitente y revisar
la entrega, reputación y enlaces en el entorno objetivo.
