# Optional Anivo server: share-link storage (docs/11 "Image 2").
# Build: docker build -f docker/server.Dockerfile -t anivo-server .
# Run:   docker run -p 8081:8081 -v anivo-data:/data anivo-server

FROM node:22-alpine AS build
WORKDIR /src
COPY apps/server/src ./src
RUN npx --yes esbuild@0.28.2 src/main.ts --bundle --platform=node --target=node22 --format=esm --outfile=/out/server.mjs

FROM node:22-alpine
ENV NODE_ENV=production PORT=8081 ANIVO_STORAGE=file:///data
COPY --from=build /out/server.mjs /app/server.mjs
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8081
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8081/healthz || exit 1
CMD ["node", "/app/server.mjs"]
