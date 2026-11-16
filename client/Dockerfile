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
RUN if [ -f package-lock.json ]; then npm ci -w client --include-workspace-root; \
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
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80

