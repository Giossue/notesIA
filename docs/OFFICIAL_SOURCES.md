# Fuentes oficiales

Verificar la versión instalada antes de implementar. Este índice no sustituye la documentación actual.

## Móvil

- React Native: https://reactnative.dev/docs/getting-started
- React Native CLI: https://reactnative.dev/docs/getting-started-without-a-framework
- React Navigation: https://reactnavigation.org/docs/getting-started/
- React Native Paper: https://callstack.github.io/react-native-paper/
- react-native-keychain: https://oblador.github.io/react-native-keychain/
- NetInfo: https://github.com/react-native-netinfo/react-native-netinfo
- SQLite: https://www.sqlite.org/docs.html
- Notificaciones Android: https://developer.android.com/develop/ui/views/notifications

## Web y tooling

- React: https://react.dev/
- Bun: https://bun.sh/docs
- Vite: https://vite.dev/guide/
- shadcn/ui: https://ui.shadcn.com/docs
- TanStack Query: https://tanstack.com/query/latest
- TanStack Router: https://tanstack.com/router/latest
- React Hook Form: https://react-hook-form.com/
- Zod: https://zod.dev/
- JSON Schema de Zod: https://zod.dev/json-schema

## API y datos

- Hono: https://hono.dev/docs/
- Drizzle: https://orm.drizzle.team/docs/overview
- PostgreSQL: https://www.postgresql.org/docs/
- Better Auth: https://www.better-auth.com/docs
- OpenAPI 3.1: https://spec.openapis.org/oas/v3.1.0

## IA

- OpenAI API: https://platform.openai.com/docs/
- Anthropic API: https://docs.anthropic.com/
- DeepSeek API: https://api-docs.deepseek.com/

Confirmar siempre:

- endpoint recomendado;
- modelo;
- structured output/tool use;
- retención;
- límites;
- precios;
- headers y versiones;
- reintentos.

## Seguridad y calidad

- OWASP MASVS: https://mas.owasp.org/MASVS/
- OWASP API Security: https://owasp.org/www-project-api-security/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- WCAG: https://www.w3.org/WAI/standards-guidelines/wcag/
- OpenTelemetry: https://opentelemetry.io/docs/

## Regla

Cuando una implementación dependa de una API externa:

1. abrir fuente oficial;
2. confirmar plataforma/versión;
3. enlazarla en PR o ADR;
4. no basarse en blogs SEO;
5. añadir prueba de integración/contrato cuando sea viable.

# Referencias del canal push

- [FCM HTTP v1 y autorización](https://firebase.google.com/docs/cloud-messaging/send/v1-api)
- [Gestión de tokens de registro](https://firebase.google.com/docs/cloud-messaging/manage-tokens)
