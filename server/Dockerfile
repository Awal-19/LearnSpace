# syntax=docker/dockerfile:1
# Build context is the repository root:  docker build -f server/Dockerfile --target prod .

FROM node:20.18.1-bookworm-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV HUSKY=0
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_maxsockets=6
WORKDIR /app

# ---- dependencies (cached unless a package.json changes) ----
FROM base AS deps
COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY e2e/package.json e2e/package.json
RUN if [ -f package-lock.json ]; then npm ci -w server --include-workspace-root; \
    else npm install -w server --include-workspace-root; fi \
  && npm cache clean --force

# ---- development (docker-compose) ----
FROM deps AS dev
COPY server ./server
RUN npm run db:generate -w server
ENV NODE_ENV=development
WORKDIR /app/server
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]

# ---- production build ----
FROM dev AS build
WORKDIR /app
RUN npm run build -w server

FROM base AS prod
ENV NODE_ENV=production
ENV PORT=4000
COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY e2e/package.json e2e/package.json
RUN if [ -f package-lock.json ]; then npm ci -w server --include-workspace-root --omit=dev; \
    else npm install -w server --include-workspace-root --omit=dev; fi \
  && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
RUN npm run db:generate -w server \
  && mkdir -p /home/node/.npm \
  && chown -R node:node /app /home/node
USER node
WORKDIR /app/server
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Startup runs safe non-blocking prisma migrate deploy inside dist/server.js after binding PORT.
CMD ["node", "dist/server.js"]
