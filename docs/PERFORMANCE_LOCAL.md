# Rendimiento local del backend

`bun run test:performance:local` arranca una instancia de API en `127.0.0.1`
con un puerto libre, verifica que PostgreSQL es `notesia_dev` local, crea una
cuenta sintética y la elimina al terminar. No usa proveedores externos. El
script falla si una petición no devuelve el estado esperado o si supera el p95
de RNF-01/RNF-02. Como el registro no crea sesiones, el script marca como
verificada únicamente su cuenta sintética en la base local y después inicia
sesión mediante la ruta pública normal.

## Carga objetivo inicial

- Un usuario autenticado, 20 materias, 50 actividades pendientes de 60 minutos
  con plazo a cinco días y siete reglas semanales de 09:00 a 17:00 UTC.
- Horizonte de preview de siete días. Se usa la duración y el máximo diario de
  las preferencias predeterminadas del usuario.
- Calentamiento: 20 lecturas, 10 creaciones y tres previews.
- Medición HTTP en loopback con cuerpo completo consumido: 200 listas de materias
  con 10 peticiones simultáneas; 200 creaciones de materia con
  `Idempotency-Key` y 10 simultáneas; 50 previews con cinco simultáneas.
- Carga cerrada: cada cliente envía otra petición al terminar la anterior. El
  p95 es la observación en posición `ceil(0.95 × n)` tras ordenar latencias.

## Medición del 2026-09-24

Equipo local: AMD Ryzen 7 5800H (8 núcleos, 16 hilos), Bun 1.3.14 y
PostgreSQL 18.6 en el mismo host. API en modo desarrollo; no se usó red externa.

| Operación | Muestras por ejecución | Concurrencia | p95 en dos ejecuciones | Límite |
|---|---:|---:|---:|---:|
| `GET /v1/subjects` | 200 | 10 | 12,3 / 13,9 ms | 500 ms |
| `POST /v1/subjects` con clave | 200 | 10 | 25,2 / 32,7 ms | 500 ms |
| `POST /v1/plans/preview` | 50 | 5 | 90,2 / 80,0 ms | 2 s |

Una tercera ejecución local el 2026-09-24, con el mismo escenario y después de
las correcciones del worker, midió p95 de 13,2 ms para la lista, 36,9 ms para
la creación idempotente y 72,7 ms para el preview semanal. Terminó dentro de
los tres límites.

Una cuarta ejecución local el 2026-09-24, con 41 migraciones aplicadas, midió
p95 de 16,8 ms, 45,0 ms y 84,3 ms respectivamente. El script confirmó el estado
HTTP de todas las peticiones y eliminó la cuenta sintética al terminar.

Una quinta ejecución local el 2026-09-25, con 45 migraciones y verificación de
correo obligatoria, midió p95 de 18,2 ms para la lista, 49,8 ms para la creación
idempotente y 98,3 ms para el preview semanal. Las 450 peticiones medidas
respondieron con el estado esperado y los tres resultados quedaron dentro de sus
límites.

La primera ejecución encontró que las transacciones idempotentes compartían
pool con Better Auth y podían agotar sus cinco conexiones. Se separó el pool
de autenticación del de dominio (5 y 10 conexiones respectivamente). Las dos
ejecuciones posteriores terminaron sin bloqueos y el script verificó que la
cuenta sintética se eliminó.

Esta medición prueba únicamente la carga y el equipo descritos. Antes de
producción se debe repetir en el entorno objetivo, con varios usuarios,
latencia de red y la configuración real de conexiones. Los límites no incluyen
proveedores de IA, correo ni push.
