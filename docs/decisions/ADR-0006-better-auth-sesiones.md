# ADR-0006: Better Auth con sesiones protegidas en PostgreSQL

- **Estado:** aceptado para desarrollo local
- **Fecha:** 2026-09-23

## Contexto

La app necesita registro, contraseña Argon2id y sesiones revocables. Better Auth, con
su adaptador PostgreSQL estándar, guarda el token de sesión en una columna de texto.
El esquema y las reglas de seguridad del proyecto exigen que ese secreto no quede
legible en el servidor.

## Decisión

Usar Better Auth 1.7.5 con su almacenamiento secundario conectado al PostgreSQL
local. Las claves del almacenamiento son HMAC-SHA-256; los
valores, incluida la lista de sesiones activas, se cifran con AES-256-GCM. El
almacenamiento incluye incremento atómico para el límite de frecuencia. No se crea la
tabla estándar `auth.session`; Better Auth consulta el almacenamiento secundario.
Los identificadores de verificación se guardan con hash y sus valores cifrados en
ese almacenamiento, sin duplicarlos en la tabla de verificaciones.
Las contraseñas se procesan con Argon2id y el cliente React Native conserva la cookie
en Android Keystore/iOS Keychain mediante react-native-keychain.

## Consecuencias

- Cerrar sesión revoca el token en PostgreSQL y el cliente borra su cookie local.
- Cambiar `BETTER_AUTH_SECRET` invalida las sesiones anteriores, ya que deriva las
  claves de búsqueda y cifrado. Una rotación planificada deberá cerrar sesiones y
  limpiar registros anteriores.
- El worker elimina periódicamente los registros expirados del almacenamiento
  en lotes acotados. Los contadores de frecuencia administrativa usan el mismo
  almacenamiento, con claves HMAC y vencimiento corto.
- El cliente nativo usa el origen `notesia://` en las peticiones de autenticación.
- El registro crea una cuenta pendiente, no crea sesión y encola una verificación
  cifrada que vence en una hora. La cuenta no puede iniciar sesión ni conservar una
  sesión anterior mientras `correo_verificado` sea falso. El enlace vuelve solo a
  `notesia://email-verified`; Android e iOS declaran esa ruta y la verificación no
  inicia sesión automáticamente.
- El reenvío devuelve la misma respuesta para cuentas inexistentes, pendientes o
  verificadas. El worker borra el enlace cifrado después de entregarlo o agotar los
  reintentos. Habilitar registro requiere SMTP configurado en API y worker.
- La recuperación usa un token de un solo uso de 15 minutos con identificador
  protegido en almacenamiento secundario. El enlace viaja cifrado por un outbox
  hasta el worker; el endpoint se habilita solo cuando se configura un remitente
  SMTP y una URL HTTPS para la pantalla de restablecimiento.
- Better Auth aplica TOTP con secreto y códigos de respaldo cifrados. Las rutas
  administrativas requieren un rol concedido por el servidor y una sesión creada
  después de activar TOTP y de asignar el rol; no se aceptan sesiones anteriores.
- Las sesiones cifradas guardan la versión de estado de la cuenta. Suspender o
  reactivar incrementa esa versión; un token anterior se rechaza aunque no haya
  aparecido en la lista de sesiones que se revoca durante la suspensión. Los
  valores anteriores a esta medida solo son válidos para cuentas en versión 1.
- El proxy de autenticación solo expone las trece operaciones previstas de sesión,
  verificación, recuperación y TOTP. Otras rutas incluidas por Better Auth devuelven `404`;
  `update-user` no puede saltarse el perfil versionado y `delete-user` no puede
  saltarse la política de eliminación. El contrato OpenAPI comprueba el mismo
  inventario. Los códigos de respaldo se pueden renovar con contraseña y cada
  código consumido deja de servir para otro inicio de sesión.

La decisión usa el comportamiento documentado de Better Auth 1.7.5 para
[`requireEmailVerification`](https://www.better-auth.com/docs/reference/options#requireemailverification)
y [verificación de correo](https://www.better-auth.com/docs/concepts/email#email-verification).
