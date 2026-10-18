# Anivo web app: static files served by an unprivileged NGINX (docs/11 "Docker image").
# Build: docker build -f docker/Dockerfile -t anivo .
# Run:   docker run -p 8080:8080 anivo

FROM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY apps/spike/package.json ./apps/spike/package.json
COPY assets ./assets
COPY scripts/build-player.ts ./scripts/build-player.ts
RUN pnpm install --frozen-lockfile --filter @anivo/web... \
 && pnpm --filter @anivo/web build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-anivo-config.sh /docker-entrypoint.d/40-anivo-config.sh
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
USER root
RUN chmod 0755 /docker-entrypoint.d/40-anivo-config.sh \
 && chown -R nginx:nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
