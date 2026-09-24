# Reglas de pruebas

- Probar comportamiento, no implementación.
- Motor con unitarias e invariantes.
- Repositorio con PostgreSQL real.
- No mockear la capa que se quiere validar.
- Externos con fake server/fixtures.
- Bug corregido incluye regresión.
- No borrar tests para acomodar un cambio sin requisito.
- E2E solo para flujos de alto valor.
- Tests independientes, deterministas y sin orden global.
