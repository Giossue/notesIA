# Requisitos del producto

## Cuenta y perfil

| ID | Nivel | Requisito |
|---|---|---|
| RF-AUTH-01 | MVP | Registrar cuenta con correo y contraseña; verificar el correo antes de crear una sesión o usar la app. |
| RF-AUTH-02 | MVP | Iniciar y cerrar sesión revocable. |
| RF-AUTH-03 | MVP | Recuperar acceso con token temporal de un solo uso. |
| RF-AUTH-04 | MVP | Editar nombre visible, idioma y zona horaria. |
| RF-AUTH-05 | MVP | Solicitar exportación y eliminación. |

## Materias y calendario

| ID | Nivel | Requisito |
|---|---|---|
| RF-ACAD-01 | MVP | Crear, editar, archivar y consultar materias. |
| RF-ACAD-02 | MVP | Registrar periodos académicos opcionales. |
| RF-ACAD-03 | MVP | Registrar clases y compromisos fijos. |
| RF-ACAD-04 | MVP | Ver agenda diaria y calendario semanal/mensual. |
| RF-ACAD-05 | POST | Importar horario desde imagen/PDF con revisión. |

## Actividades

| ID | Nivel | Requisito |
|---|---|---|
| RF-ACT-01 | MVP | Crear, editar, archivar y eliminar lógicamente actividades. |
| RF-ACT-02 | MVP | Clasificar como tarea académica, examen, personal o rutina. |
| RF-ACT-03 | MVP | Asociar actividad académica a materia. |
| RF-ACT-04 | MVP | Definir prioridad, inicio mínimo, fecha límite y estimación. |
| RF-ACT-05 | MVP | Gestionar progreso, estado y finalización. |
| RF-ACT-06 | MVP | Dividir en subtareas. |
| RF-ACT-07 | MVP | Recurrencia básica. |
| RF-ACT-08 | MVP | Conservar historial. |
| RF-ACT-09 | MVP | Capturar desde lenguaje natural con confirmación. |

## Disponibilidad

| ID | Nivel | Requisito |
|---|---|---|
| RF-AVL-01 | MVP | Definir ventanas semanales. |
| RF-AVL-02 | MVP | Excepciones por fecha. |
| RF-AVL-03 | MVP | Detectar solapamientos. |
| RF-AVL-04 | MVP | Configurar jornada y duración de sesiones. |

## Planificación

| ID | Nivel | Requisito |
|---|---|---|
| RF-PLN-01 | MVP | Generar preview para un horizonte. |
| RF-PLN-02 | MVP | Dividir actividades largas en bloques. |
| RF-PLN-03 | MVP | Respetar disponibilidad, eventos, plazos y bloqueos. |
| RF-PLN-04 | MVP | Informar trabajo no asignado. |
| RF-PLN-05 | MVP | Editar preview. |
| RF-PLN-06 | MVP | Aceptar o rechazar. |
| RF-PLN-07 | MVP | Mantener historial de versiones. |
| RF-PLN-08 | MVP | Reprogramar manualmente con validación. |

## Ejecución, riesgo y estadísticas

| ID | Nivel | Requisito |
|---|---|---|
| RF-EXEC-01 | MVP | Temporizador y registro manual de tiempo. |
| RF-EXEC-02 | MVP | Comparar estimado y real. |
| RF-RISK-01 | MVP | Calcular trabajo restante, capacidad y margen. |
| RF-RISK-02 | MVP | Clasificar riesgo y mostrar razones. |
| RF-RISK-03 | MVP | Recalcular ante cambios. |
| RF-STAT-01 | MVP | Mostrar completadas, vencidas, tiempo y cumplimiento semanal. |
| RF-STAT-02 | POST | Tendencias y estimación personalizada avanzada. |

## IA

| ID | Nivel | Requisito |
|---|---|---|
| RF-AI-01 | MVP | Extraer campos de texto/voz y pedir confirmación. |
| RF-AI-02 | MVP | Sugerir duración. |
| RF-AI-03 | MVP | Explicar riesgo determinístico. |
| RF-AI-04 | MVP | Explicar cambios de replanificación. |
| RF-AI-05 | MVP | Proponer subtareas sin crearlas automáticamente. |
| RF-AI-06 | MVP | Configurar proveedor y modelo desde admin. |
| RF-AI-07 | MVP | Funcionar manualmente cuando IA falla o está deshabilitada. |

## Notificaciones y privacidad

| ID | Nivel | Requisito |
|---|---|---|
| RF-NOT-01 | MVP | Recordar bloque y plazo. |
| RF-NOT-02 | MVP | Alertar cambio de riesgo con deduplicación. |
| RF-NOT-03 | MVP | Configurar canal, anticipación y horas silenciosas. |
| RF-PRIV-01 | MVP | Presentar documentos versionados. |
| RF-PRIV-02 | MVP | Registrar aceptación/revocación. |
| RF-PRIV-03 | MVP | Revocar IA sin perder funciones manuales. |
| RF-PRIV-04 | MVP | Minimizar datos enviados a terceros. |

## Admin

| ID | Nivel | Requisito |
|---|---|---|
| RF-ADM-01 | MVP | Consultar y suspender/reactivar cuentas con auditoría. |
| RF-ADM-02 | MVP | Configurar OpenAI, Anthropic y DeepSeek. |
| RF-ADM-03 | MVP | Registrar modelos por ID y asignarlos a casos. |
| RF-ADM-04 | MVP | Probar conexión sin revelar la key. |
| RF-ADM-05 | MVP | Ver salud, uso, costo, errores y fallback. |
| RF-ADM-06 | MVP | Consultar auditoría. |

## Requisitos no funcionales verificables

| ID | Requisito |
|---|---|
| RNF-01 | CRUD común p95 ≤ 500 ms sin dependencias externas bajo carga objetivo documentada. |
| RNF-02 | Preview estándar p95 ≤ 2 s sin explicación IA. |
| RNF-03 | Ningún secret aparece en bundle, respuesta o log. |
| RNF-04 | Toda ruta privada tiene prueba de no-auth y acceso cruzado. |
| RNF-05 | Instantes en UTC y presentación en zona IANA. |
| RNF-06 | Funciones manuales disponibles sin IA. |
| RNF-07 | Mutaciones reintentables idempotentes. |
| RNF-08 | Backup y restauración probados antes de producción. |
| RNF-09 | Flujos críticos revisados con accesibilidad. |
| RNF-10 | Pérdida de red no elimina una mutación aceptada localmente. |
