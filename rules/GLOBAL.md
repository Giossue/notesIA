# Reglas globales

- TypeScript estricto.
- Nombres de dominio en inglés en código; español en UI/documentación de producto.
- Sin `any` salvo borde documentado y validado.
- Evitar `utils`, `manager`, `helper` cuando existe un concepto específico.
- No agregar dependencia sin revisar mantenimiento, tamaño, licencia y alternativa nativa.
- No abstraer sin frontera real o variantes reales.
- No mezclar refactor masivo con una feature.
- Instantes en UTC; presentación en zona IANA.
- Nunca confiar en datos del cliente.
- Mantener compatibilidad o versionar contrato.
- Cambios pequeños, testeados y reversibles.
