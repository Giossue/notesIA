# API de NotesIA (Hono sobre Bun). Contexto de build: raíz del repositorio.
FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
# argon2 es un addon nativo: queda fuera del bundle y se instala en la imagen final.
RUN bun build apps/api/src/index.ts --target=bun --outdir dist/api --external @node-rs/argon2

FROM oven/bun:1.3.14-slim
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0 PORT=3000
RUN echo '{"name":"notesia-api-runtime","private":true,"dependencies":{"@node-rs/argon2":"2.2.1"}}' > package.json \
  && bun install --production
COPY --from=build /app/dist/api ./dist/api
USER bun
EXPOSE 3000
CMD ["bun", "dist/api/index.js"]
