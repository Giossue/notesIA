# Documentos y consentimiento en el backend

La migración `0018_documentos_consentimientos.sql` crea documentos versionados y un
historial de decisiones por usuario. No incluye contenido legal. Solo un operador
autorizado puede cargar y publicar texto aprobado; la cuenta de la API tiene lectura
de documentos y únicamente inserción de consentimientos. Un documento publicado no
se puede editar ni eliminar. Una versión nueva debe usar otra fila.

## Contratos

- `GET /v1/privacy/documents?language=es`: última versión publicada por tipo e idioma.
- `GET /v1/me/consents`: decisión vigente de cada tipo para la sesión actual.
- `POST /v1/me/consents` con `{ "documentId": "uuid" }`: acepta solo la última
  versión publicada de ese tipo e idioma. Repetir la misma aceptación devuelve el
  mismo registro.
- `POST /v1/me/consents/ai/revoke`: revoca solo el consentimiento de IA. Sin
  aceptación previa devuelve `204`; repetir una revocación devuelve el registro
  anterior.
- `POST /v1/me/export` con `{ "password": "..." }`: descarga JSON con los datos
  propios desde una transacción de solo lectura, incluidos rol y estado de cuenta,
  preferencias de avisos, riesgos actuales, referencias de notificaciones, metadatos
  de dispositivos push y el estado de una solicitud de eliminación. Exige contraseña actual, no incluye
  credenciales, tokens ni datos de otras cuentas y usa `Cache-Control: no-store`.
- `GET /v1/me/deletion-request`: consulta la solicitud propia, o `null`.
- `POST /v1/me/deletion-request` con contraseña y `confirmation: "ELIMINAR"`:
  programa la eliminación tras el plazo configurado. Repetirla conserva la fecha.
  La última cuenta administradora no puede solicitarla.
- `DELETE /v1/me/deletion-request` con contraseña y `confirmation: "CANCELAR"`:
  cancela la solicitud durante el plazo de gracia.

`0028_eliminacion_cuenta.sql` crea solicitudes y auditoría de eliminación. El
worker procesa solicitudes vencidas en una transacción: revoca sesiones del
almacén cifrado, elimina la cuenta y sus datos privados relacionados y añade un
evento de finalización con HMAC del ID. La auditoría administrativa permanece
inmutable; tras el borrado, sus UUID no tienen cuenta asociada. El worker purga
únicamente eventos de eliminación cuya retención registrada ya venció. Una
solicitud puede quedar bloqueada si es la última cuenta administradora o si la
política del worker difiere de la usada al solicitarla.

`ACCOUNT_DELETION_GRACE_DAYS`, `ACCOUNT_DELETION_AUDIT_RETENTION_DAYS` y
`ACCOUNT_DELETION_AUDIT_KEY` deben configurarse juntas en API y worker. La
solicitud guarda una huella de la política; el worker no purga con una política
diferente. Sin configuración, las rutas responden `503` y el worker no elimina
cuentas. Antes de habilitarla hay que aprobar los plazos, la retención de la
auditoría administrativa y el tratamiento de cuentas borradas en los backups.
El rollback de `0028` se niega si existe alguna solicitud o evento.

Los consentimientos de términos y privacidad no tienen endpoint de revocación. El
historial conserva el identificador y la versión exacta del documento aceptado. Una
versión nueva requiere una aceptación nueva. El gateway comprueba la última decisión
de IA y la versión publicada vigente antes y después de cada llamada externa. Una
revocación durante la llamada descarta la sugerencia.

`0039_orden_consentimientos.sql` asigna un orden persistente a cada decisión. Para
registros anteriores con la misma hora, la migración coloca las revocaciones al
final para que prevalezcan. Las consultas de consentimiento vigente y el gateway
usan ese orden; la hora sigue siendo informativa. El rollback manual de `0039`
se niega si existe historial de consentimientos.

## Publicación y cierre pendiente

Faltan los textos aprobados. La ruta administrativa para crear borradores y publicar
versiones verifica el rol en servidor, pide confirmación y registra auditoría. Exige
TOTP activo y una sesión posterior a la activación y a la concesión del rol. Solo un
administrador de PostgreSQL puede asignar el primer rol `admin`; después, un
administrador con MFA y contraseña verificada puede asignar o quitar roles. La API
impide quitar el propio rol o el último administrador. Limita a cada administrador
a 120 lecturas y 30 mutaciones por minuto; después responde `429` con
`Retry-After`. No insertar textos de ejemplo en `notesia_dev` ni abrir
registro público para usuarios reales antes de esa aprobación. La recuperación de
contraseña ya tiene flujo de API y worker con SMTP configurable; falta conectar
un proveedor real y la pantalla de restablecimiento. La eliminación ya tiene
flujo de backend probado, pero requiere una política aprobada para habilitarse.

El rollback manual preparado en `packages/db/rollback/0018_documentos_consentimientos.sql`
se niega a ejecutarse si existen documentos o consentimientos. No hay rollback
automático de datos privados.

## Administración local

- `GET /v1/admin/privacy-documents` lista borradores y publicaciones por cursor.
- `POST /v1/admin/privacy-documents` crea un borrador con `id`, `type`,
  `language`, `version` y `content`. La versión debe superar las anteriores del
  mismo tipo e idioma.
- `POST /v1/admin/privacy-documents/:id/publish` con
  `{ "confirmation": "PUBLICAR" }` publica una versión. La llamada exige el
  origen del panel y registra el actor. No puede publicarse una versión anterior
  a otra ya publicada.
- `GET /v1/admin/audit` lista las operaciones por cursor, sin copiar el texto del
  documento a la auditoría.
- `GET /v1/admin/users` lista cuentas y estado por cursor. Solo un administrador
  con TOTP y sesión nueva puede verla.
- `PUT /v1/admin/users/:userId/suspension` exige `suspended`, `version`,
  `confirmation` (`SUSPENDER` o `REACTIVAR`), contraseña actual y origen del panel.
  La suspensión revoca sesiones cifradas y bloquea nuevos inicios; la reactivación
  exige iniciar sesión otra vez. Ambas acciones se auditan. Un administrador no
  puede suspenderse a sí mismo ni dejar sin acceso al último administrador activo.

El rollback manual `0020_admin_documentos.sql` se niega si ya hay roles o eventos
de auditoría. `0024_roles_versionados.sql` añade control de versión y auditoría
para `GET/PUT/DELETE /v1/admin/roles`; su rollback se niega tras cambios de rol.
`0031_suspension_cuentas.sql` añade estado versionado e índice de paginación; el
rollback se niega si ya hay cambios de suspensión o eventos de auditoría.
El primer administrador debe ser provisionado por el operador de PostgreSQL. El
panel cliente debe incorporar alta y desafío TOTP antes de su uso operativo.
