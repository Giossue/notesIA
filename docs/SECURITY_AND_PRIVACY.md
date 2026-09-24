# Seguridad y privacidad

## Autenticación

- Argon2id mediante biblioteca mantenida.
- Verificación de correo para acciones sensibles.
- Recuperación con token de un solo uso, hash y expiración corta.
- Sesiones revocables y rotación.
- MFA para administradores antes de producción.
- No revelar si un correo existe.

## Autorización

- Denegar por defecto.
- Rol validado en servidor.
- Todo recurso personal se carga por `id + user_id`.
- Pruebas de acceso horizontal y vertical.
- Operaciones admin auditadas.
- No confiar en permisos de UI.

## API

- TLS.
- CORS allowlist.
- límites de body;
- validación estricta;
- rate limit en auth, IA y admin;
- idempotencia;
- errores sin stack/SQL;
- cabeceras de seguridad;
- request ID.

## Móvil

- No secrets en bundle.
- Android Keystore/iOS Keychain para la cookie de sesión.
- Deep links con allowlist.
- No confiar en validación cliente.
- Minimizar datos SQLite.
- Borrar cache al cerrar/eliminar cuenta.
- No registrar payloads offline.

## Admin

- Cookie HttpOnly, Secure y SameSite apropiado.
- CSRF según estrategia.
- No token persistente en localStorage.
- Reautenticación para roles/keys.
- Secretos write-only.
- Confirmación reforzada para acciones destructivas.

## IA

- Keys solo servidor.
- Secret manager o cifrado envelope.
- Consentimiento vigente.
- PII mínima.
- Salida no confiable y validada.
- Sin tools con acceso general a DB.
- Cuota, presupuesto y timeout.
- Prompt injection tratada como dato, no instrucción.
- No guardar cadena de pensamiento ni prompts completos.

## Privacidad

Consentimientos separados:

1. términos;
2. privacidad;
3. uso de IA.

Revocar IA conserva CRUD, agenda, motor, riesgo y notificaciones.

Para una explicación de riesgo, enviar solo algo semejante a:

```json
{
  "title": "Informe de base de datos",
  "deadline": "2026-10-02T22:00:00Z",
  "remainingMinutes": 300,
  "availableMinutes": 180,
  "slackMinutes": -120,
  "riskLevel": "high",
  "reasons": ["insufficient_capacity"]
}
```

No enviar nombre, correo, ID institucional o historial completo si no aportan.

## Retención

Antes de producción definir plazos para:

- cuenta;
- auditoría;
- recomendaciones;
- usage IA;
- notificaciones;
- backups;
- solicitudes de eliminación.

## Eliminación

- confirmar identidad;
- periodo de gracia;
- revocar sesiones;
- eliminar/anonimizar;
- conservar solo lo legalmente justificado;
- registrar finalización auditada.

## Amenazas iniciales

| Amenaza | Control |
|---|---|
| Acceso a actividad ajena | Scoping por usuario + pruebas. |
| Robo de sesión | Keystore/Keychain en móvil; cookie HttpOnly en admin, rotación y revocación. |
| Key IA en bundle | Solo servidor + secret manager. |
| Prompt injection | Delimitación, sin tools, salida validada. |
| Duplicación por reintento | Idempotency-Key. |
| Conflicto offline | Versionado y 409. |
| Abuso/costo IA | Rate limit, cuota y presupuesto. |
| Log sensible | Redacción y allowlist. |
| Escalada admin | RBAC servidor + pruebas. |
| Bloques manipulados por cliente | Revalidación completa en servidor. |

Use OWASP MASVS, OWASP API Security y OWASP ASVS como referencias de control.
