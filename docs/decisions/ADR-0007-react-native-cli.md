# ADR-0007: React Native CLI y Metro sin Expo

- **Estado:** aceptado
- **Fecha:** 2026-09-23

## Contexto

El usuario quiere desarrollar la aplicación móvil en Metro sin usar Expo y mantiene otra aplicación en el puerto 8081.

## Decisión

Usar React Native CLI 0.86.3 con proyecto Android/iOS nativo. Metro de NotesIA usa el puerto 8082. React Navigation reemplaza Expo Router; react-native-keychain guarda la cookie de Better Auth en el almacén seguro del sistema. React Native Paper sigue siendo el único kit de interfaz.

## Consecuencias

- Android requiere JDK 17, SDK y compilación Gradle local.
- El cliente Android accede a la API Bun local por `adb reverse tcp:3000 tcp:3000`.
- La app nativa requiere instalación inicial y recompilación tras cambiar dependencias nativas.
- El puerto 8081 y las aplicaciones ajenas al proyecto no se modifican.
