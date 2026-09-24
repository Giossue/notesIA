# ADR-0005: Offline tolerante y acotado

- **Estado:** aceptado
- **Fecha:** 2026-09-23

## Decisión

Permitir lectura cacheada y cola de mutaciones simples. No generar/aplicar planes ni invocar IA sin red.

## Consecuencias

- complejidad controlada;
- idempotencia y versionado obligatorios;
- conflictos relevantes se muestran al usuario.
