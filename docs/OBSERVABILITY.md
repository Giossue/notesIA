# Observabilidad operativa

## Trazas correlacionadas

API y worker emiten spans JSON correlacionados con un contexto compatible con
W3C Trace Context. La implementación usa `AsyncLocalStorage`, sin acoplar el
dominio a un proveedor de telemetría.

## Propagación

- La API acepta únicamente `traceparent` versión `00` con identificadores
  hexadecimales minúsculos, longitud exacta y valores distintos de cero.
- Un encabezado ausente o inválido inicia una traza aleatoria nueva. La respuesta
  devuelve el `traceparent` normalizado del span de la API.
- `AsyncLocalStorage` mantiene el contexto entre promesas concurrentes. Cada
  consulta ejecutada dentro de una traza crea un span hijo `db.query`.
- Las migraciones `0043_contexto_trazas.sql` y `0044_correos_verificacion.sql`
  guardan solo `traza_id` y `span_origen_id` en outbox, correos de recuperación y
  verificación, y envíos push. Así el worker
  continúa el contexto después de que la transacción y el proceso originales
  terminaron. Una fila histórica sin esos valores inicia una traza nueva.
- Las llamadas de IA, FCM y SMTP crean un span local de proveedor. El contexto
  interno no se envía a esos servicios externos.

El recorrido persistido de un plan aplicado es:

```text
api.request -> db.query -> worker.outbox -> db.query
            -> worker.push-delivery -> provider.fcm
```

La recuperación y la verificación siguen el mismo patrón mediante
`worker.recovery-mail`, `worker.verification-mail` y `provider.smtp`. Una llamada
de IA enlaza `api.request` con `provider.ai`.

## Formato y privacidad

Cada línea `trace_span` contiene exclusivamente:

- hora, `traceId`, `spanId` y `parentSpanId`;
- nombre y componente tomados de listas cerradas;
- destino acotado (`postgresql`, proveedor IA, `fcm` o `smtp`);
- resultado `ok`/`error` y duración en milisegundos.

No se registran SQL, parámetros, rutas, correos, identificadores de cuenta,
tokens, prompts, cuerpos, URLs, excepciones ni respuestas de proveedor. No se
propaga `baggage` ni `tracestate`. Los escritores descartan identificadores de
traza que no cumplan el formato esperado y omiten campos desconocidos.

La API y el worker activan la salida a `stdout` al arrancar. El repositorio no
configura un colector ni retención externa; el entorno de despliegue debe recoger
las líneas JSON si se necesita consulta histórica.

## Señales y alertas

`GET /v1/admin/system-health` agrega los intentos de IA terminados durante los
15 minutos anteriores. Por proveedor muestra solicitudes, éxitos, fallos de
disponibilidad y errores. También expone el costo conocido en USD y cuántas
solicitudes todavía no tienen costo calculado. No devuelve usuarios, modelos,
casos, prompts, respuestas ni identificadores de uso.

Las señales de IA aplican estas reglas fijas:

| Código | Condición dentro de la ventana de 15 minutos |
|---|---|
| `AI_PROVIDER_UNAVAILABLE` | Al menos cinco resultados `error` o `timeout` y ningún éxito del proveedor. |
| `AI_ERROR_RATE_HIGH` | Al menos diez solicitudes terminadas y 50 % o más en `error`, `timeout`, `invalid` o `unknown`. |
| `AI_COST_HIGH` | El costo conocido alcanza el límite operativo configurado. |

Si un proveedor cumple la primera regla, no se emite además la alerta de tasa de
error para ese proveedor. El costo se compara como decimal, sin conversión a
punto flotante. Las solicitudes sin costo permanecen visibles en
`uncostedRequests`, pero no se inventa un costo para ellas.

La alerta de costo se habilita únicamente con
`OPS_ALERT_AI_COST_LIMIT_USD_15M`. El valor debe ser un decimal USD positivo de
hasta seis enteros y nueve decimales. El repositorio no define un límite por
defecto: debe aprobarlo la persona responsable de la operación.

Cuando están configurados `OPS_ALERT_WEBHOOK_URL`,
`OPS_ALERT_WEBHOOK_SECRET` y `OPS_ALERT_SOURCE`, la API sondea estas señales junto
con el latido y las colas. El webhook recibe solo códigos de alerta y, cuando
corresponde, el nombre acotado de la cola o proveedor. La entrega conserva firma
HMAC, clave de idempotencia, notificación de resolución y repetición acotada. Las
métricas agregadas completas quedan disponibles en la ruta administrativa.

## Verificación y rollback

Las pruebas cubren formato W3C, contextos concurrentes, campos permitidos,
continuidad API→outbox→push y API→correos de recuperación y verificación, además
de la ausencia de SQL y valores
privados en los eventos. Una integración con PostgreSQL comprueba la ventana, los
conteos por proveedor, el costo conocido y la exclusión de modelos e
identificadores. Las reglas de alerta y el cuerpo firmado se prueban sin servicios
externos. El rollback manual de `0043` elimina solo metadatos operativos. Se debe
desplegar primero el código anterior y después ejecutar
`packages/db/rollback/0043_contexto_trazas.sql`. La cola de verificación forma
parte de la salud operativa desde `0044`; su rollback se niega mientras haya filas.

Fuentes técnicas: [W3C Trace Context](https://www.w3.org/TR/trace-context/) y
[compatibilidad Node.js de Bun](https://bun.com/docs/runtime/nodejs-compat).
