# ADR-0002: Expo, React Native y React Native Paper

- **Estado:** reemplazado por ADR-0007
- **Fecha:** 2026-09-23

## Decisión

Usar Expo + React Native + TypeScript. React Native Paper es el único kit externo de UI móvil.

## Consecuencias

- tema/accesibilidad consistentes;
- no mezclar NativeBase, Tamagui, UI Kitten u otros kits;
- librerías funcionales no visuales se permiten si están justificadas;
- capacidades nativas se evalúan dentro del flujo Expo antes de ejecutar.
