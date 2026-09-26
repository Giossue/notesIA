# Worker de NotesIA (colas, correos, avisos, riesgo). Contexto: raíz del repositorio.
FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
RUN bun build apps/worker/src/index.ts --target=bun --outdir dist/worker

FROM oven/bun:1.3.14-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist/worker ./dist/worker
USER bun
CMD ["bun", "dist/worker/index.js"]
