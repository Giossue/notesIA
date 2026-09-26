# Panel de administración (SPA estática). Las rutas /v1 las atiende la API en el
# mismo dominio (regla de ruta en Dokploy), así las cookies de sesión funcionan.
FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
RUN cd apps/admin && bunx vite build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/admin/dist /srv
EXPOSE 80
