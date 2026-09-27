# Gateway de IA del backend

El endpoint `POST /v1/ai/:useCase/suggestions` requiere sesión y aceptación de la
versión vigente del documento de IA. Los casos son `extract_activity`,
`estimate_duration`, `explain_risk`, `explain_replan` y `propose_subtasks`. Las
entradas y salidas se validan con Zod; los prompts tienen versión en código.
Para `explain_risk`, el cliente envía `planId` y `activityId`; para
`explain_replan`, envía `planId`. El servidor carga métricas determinísticas
filtradas por usuario, sin aceptar cifras del cliente. Rechaza una explicación de
riesgo que cambie el nivel o incluya cifras y una explicación de replanificación
con cifras no verificadas.
Si cambian las fuentes de un plan, la explicación de riesgo devuelve `409` y exige
una vista previa nueva antes de consultar IA.
Ninguna respuesta modifica actividades, subtareas ni planes. Una sugerencia indica
`source: "ai"` y `requiresConfirmation: true`.
En el chat, una pregunta sobre cómo organizar entregas puede responderse con
orientación sin acciones. Las tarjetas de confirmación solo aparecen cuando el
servidor valida una propuesta de cambio; una respuesta que promete una tarjeta
sin propuesta válida se reemplaza por un mensaje de error seguro.

`apps/api/src/modules/ai` contiene la frontera y adaptadores HTTP para OpenAI
Responses, Anthropic Messages y DeepSeek Chat Completions. El modelo se configura
por caso; no existe uno predeterminado. Se usa salida estructurada donde el
proveedor la ofrece, seguida siempre de validación local. OpenAI recibe `store:
false`. El gateway elimina correos, teléfonos y enlaces detectables, limita texto,
aplica timeout y vuelve a comprobar el consentimiento antes de entregar el resultado.
No registra entradas, salidas, prompts completos ni claves.

## Configuración administrativa

Todas estas rutas exigen rol `admin`, TOTP activo y sesión nueva después de su
activación y de la asignación del rol. Las mutaciones exigen el origen del panel.
Cambios de claves y rutas también exigen confirmar la contraseña actual.
Las rutas administrativas aplican 120 lecturas y 30 mutaciones por minuto por
administrador, con respuesta `429` y `Retry-After` al superar el límite.

- `GET /v1/admin/ai/providers`: conexiones sin claves.
- `PUT /v1/admin/ai/providers/:provider`: `{apiKey?, enabled}`. La clave se cifra
  con `AI_ENCRYPTION_KEY` y nunca se devuelve; omitirla conserva la existente.
- `GET /v1/admin/ai/routes`: rutas sin secretos.
- `PUT /v1/admin/ai/routes/:useCase`: proveedor, `modelId`, `timeoutMs`,
  `maxOutputTokens`, `dailyBudgetTokens`, `enabled`, `inputPriceUsdPerMillion` y
  `outputPriceUsdPerMillion` (cadenas decimales USD por millón de tokens), y confirmaciones de revisión
  de capacidad, costo y privacidad. `alternate` es opcional: `null` elimina la
  ruta alterna; un objeto configura otro proveedor con su modelo, timeout,
  máximo de salida y precios. Omitirlo también elimina la ruta alterna. No se
  aceptan alias `latest` ni el mismo proveedor en ambas posiciones.
- `POST /v1/admin/ai/routes/:useCase/test`: prueba el principal y el alterno
  configurado con datos sintéticos; audita cada proveedor probado.
- `GET /v1/admin/ai/usage?from=YYYY-MM-DD&through=YYYY-MM-DD`: suma solicitudes
  y tokens por caso, proveedor y estado en días UTC. Incluye `knownCostUsd`,
  `totalCostUsd` y `uncostedRequests`; el total es `null` si alguna solicitud
  carece de precios o de uso reportado por el proveedor. `fallbacks` agrega por
  caso y motivo las respuestas manuales, incluso sin llamada al proveedor.
  `transitions` agrega por caso, proveedor origen/destino y motivo los intentos
  que cambiaron de proveedor, sin identificar al estudiante.
  Cada grupo incluye duración media, p95 discreto y cantidad de solicitudes sin
  medición; los tiempos son del intento completo del gateway y son `null` cuando
  no hay muestras. Los estados separados permiten ver errores y timeouts sin
  incluir usuarios ni contenido.
  `from` es inclusivo,
  `through` exclusivo y el rango máximo es de 31 días. No devuelve identidades,
  entradas, salidas, modelo ni claves. Los tokens reservados son la cuota
  conservadora, no el consumo facturado.
- `GET /v1/admin/audit`: acciones administrativas, sin claves ni contenido privado.
- `GET /v1/admin/system-health`: conectividad de PostgreSQL y contadores de
  colas de outbox, recuperación, verificación de correo y la cola histórica de
  push, que permanece inactiva; además muestra el último latido del worker y si fue
  visto durante los dos minutos previos. Cada cola incluye la fecha del mensaje
  listo más antiguo. `alerts` señala un worker sin latido reciente, mensajes
  muertos y backlog de al menos 100 mensajes listos o uno listo durante más de
  cinco minutos. En una ventana fija de 15 minutos también agrega intentos,
  éxitos, indisponibilidad y errores por proveedor, costo conocido y solicitudes
  sin costo. Señala cinco fallos de transporte sin éxitos, una tasa de error de
  al menos 50 % desde diez resultados y, si el operador configura el límite, costo
  conocido anormal. No contiene usuarios, modelos ni payloads; un latido reciente
  no prueba que todos los envíos hayan terminado. Estas señales se consultan desde
  admin y, al configurar el webhook operativo de la API, se envían como una
  instantánea firmada cuando cambian y periódicamente mientras siguen activas.

La ruta solo opera cuando proveedor y caso están habilitados. Cada llamada reserva
una reserva conservadora que incluye bytes UTF-8 del mensaje, esquema y prompt,
más el máximo de salida y un margen. PostgreSQL serializa las reservas por caso
y por usuario para limitar el presupuesto diario y hasta diez solicitudes por
usuario por minuto incluso si se llaman varios casos a la vez. Se registra
estado, proveedor, modelo, versión de prompt, tokens y latencia. Si no hay ruta,
se agota la cuota, falla el proveedor o la salida es inválida, la API devuelve
`kind: "manual"` con una causa segura. Cuando existe un alterno habilitado, un
fallo o una salida inválida del principal puede originar **un** segundo intento.
Cada intento tiene reserva y costo propios dentro de la misma cuota diaria del
caso; la reserva y la transición auditada se escriben en una sola transacción.
Se comprueba de nuevo el consentimiento antes del alterno y antes de entregar
una sugerencia. Si se revoca o falta presupuesto, no se llama al alterno. Si
falta consentimiento responde
`AI_CONSENT_REQUIRED` sin llamar al proveedor.
El worker marca como `unknown` las reservas que sigan abiertas tras cinco minutos;
procesa lotes de hasta 500 filas. El resultado del proveedor puede ser incierto
tras una caída, por lo que la reserva sigue contando en el presupuesto diario y
el costo permanece sin valorar. Una finalización tardía puede reemplazar
`unknown` por el estado y el uso reportado. El rollback manual de `0041` se niega
si hay resultados inciertos.
Cada fallback manual agrega un evento sin usuario, prompt ni respuesta a
`dominio.fallback_ia`. Si falla solo la escritura de esa métrica, la respuesta
manual sigue disponible y el servidor emite una advertencia sin datos privados.
Las transiciones entre proveedores quedan en `dominio.transiciones_ia`, enlazadas
a las dos reservas. La API administrativa solo muestra recuentos agregados.

El costo es una estimación contable calculada en PostgreSQL con los precios
configurados por el administrador y los tokens reportados. Cada solicitud conserva
una copia de los precios de su ruta; cambios posteriores no revalúan usos anteriores.
Las rutas ya configuradas antes de `0036` mantienen precios `null` hasta que un
administrador las actualice. El uso anterior tampoco se reconstruye con tarifas
supuestas. Las tarifas reales, descuentos e impuestos deben conciliarse con la
factura del proveedor.

## Límites pendientes

La cuota usa tokens estimados; faltan una evaluación real de modelos y costos,
reintentos controlados, interruptor de fallos,
visualización de métricas agregadas en el panel y revisión de políticas de retención antes de
activar una conexión real. No se han configurado modelos ni claves reales.

El rollback manual `packages/db/rollback/0023_ia_gateway.sql` se niega si existen
conexiones o registros de uso. No hay rollback automático de datos privados.
El rollback manual de `0042` se niega si hay rutas alternas o transiciones.
