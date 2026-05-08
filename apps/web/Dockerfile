# PSMS web — production image.
#
# Multi-stage:
#   1. build — pnpm install + vite build (static files in dist/)
#   2. nginx — serve dist/ via nginx; SPA fallback to index.html
#
# The web container does not call the API directly: nginx proxies
# /api/v1/* to the API container. The proxy URL is set at runtime via
# the API_UPSTREAM env var (default http://api:3000).

# ── Stage 1: build ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --prod=false

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api/openapi.yaml apps/api/openapi.yaml
COPY apps/web apps/web
COPY scripts scripts

# Generate types the web bundle expects.
RUN pnpm types:generate
RUN pnpm api:client

RUN pnpm --filter @psms/web build

# ── Stage 2: nginx ─────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# nginx config: SPA fallback + reverse proxy of /api/v1 to the API container.
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template

# nginx 1.19+ envsubst's any *.template into /etc/nginx/conf.d at startup.
ENV API_UPSTREAM=http://api:3000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O - http://localhost/ >/dev/null 2>&1 || exit 1
