# Reglas móvil

- React Native Paper es el único kit de componentes.
- React Navigation; rutas delgadas.
- TanStack Query para servidor.
- Zustand solo para estado efímero.
- Android Keystore/iOS Keychain para sesión.
- SQLite para cache/outbox acotado.
- Un cliente API central.
- Ninguna pantalla llama `fetch`.
- RHF + Zod para formularios.
- Mostrar mutación pendiente/error.
- No ocultar conflictos.
- Tema semántico; no colores directos en features.
- Accesibilidad en iconos, estados, foco y texto.
- No crear wrapper por cada componente de Paper.
- No usar `useEffect` para datos derivados simples.
