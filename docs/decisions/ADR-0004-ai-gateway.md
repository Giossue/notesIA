# ADR-0004: Gateway multi-proveedor

- **Estado:** aceptado
- **Fecha:** 2026-09-23

## Decisión

OpenAI, Anthropic y DeepSeek se encapsulan detrás de `AiGateway`. Modelos y rutas se configuran por caso de uso en servidor.

## Consecuencias

- SDK/formato no contaminan dominio;
- modelos cambian sin publicar móvil;
- se requieren tests por adaptador;
- keys permanecen en servidor.
