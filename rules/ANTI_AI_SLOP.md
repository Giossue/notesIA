# Reglas anti-AI-slop

## Producto

- No agregar IA cuando una regla simple resuelve mejor.
- No chatbot general.
- No mensajes motivacionales vacíos.
- No “score de productividad” sin fórmula.
- No “personalización” por insertar el nombre.
- No ocultar incertidumbre.
- No aplicar cambios sin preview.
- No llenar pantallas con etiquetas “AI-powered”.

## Código

- No componentes gigantes.
- No `GodService`.
- No repositorio genérico universal.
- No wrappers que solo reenvían.
- No diez archivos vacíos para una feature pequeña.
- No tipos/validaciones/componentes duplicados.
- No comentarios que repiten el código.
- No nombres vagos generados.
- No `catch {}`.
- No `console.log` permanente.
- No mock disfrazado de integración.
- No modelo hardcodeado como “latest”.

## Prueba de valor

Toda función IA debe responder:

1. ¿Qué problema medible resuelve?
2. ¿Por qué no basta una regla?
3. ¿Qué datos recibe?
4. ¿Qué puede fallar?
5. ¿Qué alternativa manual existe?
6. ¿Cómo se evalúa?
7. ¿Cuánto cuesta?

Sin respuestas, no se implementa.
