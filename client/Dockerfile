# syntax=docker/dockerfile:1
# Build context is the repository root:  docker build -f client/Dockerfile --target prod .

FROM node:20-alpine AS base
ENV HUSKY=0
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY e2e/package.json e2e/package.json
RUN if [ -f package-lock.json ]; then \
      npm ci -w client --include-workspace-root && \
      ROLLUP_VER=$(node -p "require('./node_modules/rollup/package.json').version") && \
      ARCH=$(uname -m) && \
      if [ "$ARCH" = "x86_64" ]; then npm install --no-save --no-package-lock "@rollup/rollup-linux-x64-musl@$ROLLUP_VER"; \
      elif [ "$ARCH" = "aarch64" ]; then npm install --no-save --no-package-lock "@rollup/rollup-linux-arm64-musl@$ROLLUP_VER"; fi; \
    else npm install -w client --include-workspace-root; fi

# ---- development (docker-compose) ----
FROM deps AS dev
COPY client ./client
WORKDIR /app/client
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- production build ----
FROM dev AS build
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS prod
ENV API_UPSTREAM=https://learnspace-api-production.up.railway.app
ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM
COPY client/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80

