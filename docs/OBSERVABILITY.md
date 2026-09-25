# Trazas operativas

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
- La migración `0043_contexto_trazas.sql` guarda solo `traza_id` y
  `span_origen_id` en outbox, correo de recuperación y envíos push. Así el worker
  continúa el contexto después de que la transacción y el proceso originales
  terminaron. Una fila histórica sin esos valores inicia una traza nueva.
- Las llamadas de IA, FCM y SMTP crean un span local de proveedor. El contexto
  interno no se envía a esos servicios externos.

El recorrido persistido de un plan aplicado es:

```text
api.request -> db.query -> worker.outbox -> db.query
            -> worker.push-delivery -> provider.fcm
```

La recuperación sigue el mismo patrón mediante `worker.recovery-mail` y
`provider.smtp`. Una llamada de IA enlaza `api.request` con `provider.ai`.

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

## Verificación y rollback

Las pruebas cubren formato W3C, contextos concurrentes, campos permitidos,
continuidad API→outbox→push y API→correo, además de la ausencia de SQL y valores
privados en los eventos. El rollback manual de `0043` elimina solo metadatos
operativos. Se debe desplegar primero el código anterior y después ejecutar
`packages/db/rollback/0043_contexto_trazas.sql`.

Fuentes técnicas: [W3C Trace Context](https://www.w3.org/TR/trace-context/) y
[compatibilidad Node.js de Bun](https://bun.com/docs/runtime/nodejs-compat).
