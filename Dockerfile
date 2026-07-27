# Stage 1: build the Angular app (production configuration).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve the static SPA with Caddy (gzip, SPA fallback, listens on $PORT).
FROM caddy:2-alpine AS runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/edv-route-admin/browser /srv
