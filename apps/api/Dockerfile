# PSMS API — production image.
#
# Multi-stage build:
#   1. deps   — install workspace deps (cached)
#   2. build  — generate Prisma client, regenerate OpenAPI types, tsc
#   3. runner — copy compiled JS + node_modules into a slim image
#
# The image runs as a non-root user, listens on PORT (default 3000),
# and reads every secret from the env (see .env.example).

# ── Stage 1: deps ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# OpenSSL is a runtime requirement for the Prisma engine on Debian slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: build ─────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY scripts scripts

# Generate types from the OpenAPI contract and the Prisma client.
RUN pnpm --filter @psms/shared exec prisma generate
RUN pnpm types:generate

# Compile API + shared.
RUN pnpm --filter @psms/shared build || true
RUN pnpm --filter @psms/api build

# Strip dev deps for the runner stage.
RUN pnpm prune --prod

# ── Stage 3: runner ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# Non-root user.
RUN groupadd -r psms && useradd -r -g psms -d /app -s /sbin/nologin psms

COPY --from=build --chown=psms:psms /app/node_modules ./node_modules
COPY --from=build --chown=psms:psms /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build --chown=psms:psms /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=psms:psms /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=psms:psms /app/packages/shared/schema.prisma ./packages/shared/schema.prisma
COPY --from=build --chown=psms:psms /app/packages/shared/migrations ./packages/shared/migrations
COPY --from=build --chown=psms:psms /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=psms:psms /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=psms:psms /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=psms:psms /app/apps/api/openapi.yaml ./apps/api/openapi.yaml

USER psms

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
