# ADR-0001: API separada de los clientes

- **Estado:** aceptado
- **Fecha:** 2026-09-23

## Contexto

Móvil y admin necesitan autenticación, autorización, PostgreSQL y proveedores externos.

## Decisión

Toda operación pasa por una API. Los clientes nunca se conectan a DB ni proveedores de IA.

## Consecuencias

- secretos y reglas quedan en servidor;
- contratos deben versionarse;
- offline usa sincronización;
- aumenta operación backend, pero reduce exposición y acoplamiento.
