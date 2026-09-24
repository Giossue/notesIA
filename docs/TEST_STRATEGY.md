# Estrategia de pruebas

## Unitarias

- operaciones de intervalos;
- expansión de recurrencia;
- resta de eventos;
- ranking;
- chunking;
- trabajo restante;
- riesgo;
- conversión de zona;
- validadores.

## Integración

- repositorios con PostgreSQL real;
- transacción dominio + outbox;
- plan apply;
- exclusión de bloques efectivos;
- idempotencia;
- control de versión;
- claims del worker;
- adaptadores externos con servidor fake.

## Componentes

Móvil:

- formularios;
- estados loading/empty/error/offline;
- preview;
- conflicto de sync;
- accesibilidad.

Admin:

- formularios de provider;
- secret write-only;
- permisos;
- confirmaciones;
- tablas y filtros.

## E2E críticos

El backend ejecuta `apps/api/src/backend-flow.integration.test.ts` sobre una base
PostgreSQL local aislada: registro, tres consentimientos sintéticos, organización,
preview, aplicación, outbox, tiempo manual, riesgo y revocación de IA. El flujo
manual sigue disponible después de revocar IA. No inserta documentos de prueba en
`notesia_dev`.

1. registrar y consentir;
2. crear materia y actividad;
3. definir disponibilidad;
4. generar preview;
5. aplicar;
6. registrar sesión;
7. observar riesgo/estadística;
8. revocar IA;
9. confirmar que el flujo manual continúa.

## Invariantes del motor

- no hay solapamiento efectivo;
- bloque dentro de disponibilidad;
- no cruza evento fijo;
- duración positiva;
- bloque bloqueado se preserva o se reporta imposibilidad;
- total asignado no supera trabajo restante;
- misma entrada + versión = mismo resultado.

## IA

- salida válida e inválida;
- timeout;
- 429;
- fallback;
- consentimiento ausente;
- campos faltantes;
- explicación contradictoria rechazada;
- prompt injection;
- presupuesto agotado.

## Seguridad

Toda ruta privada debe probar:

- sin sesión;
- sesión vencida;
- rol incorrecto;
- UUID ajeno;
- payload inválido;
- rate limit cuando aplique.

## Regresión

Cada bug corregido debe tener un test que falle antes del fix cuando sea razonable.
