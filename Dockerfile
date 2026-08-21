# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV NODE_ENV=production
ENV PORT=5000
ENV BASE_PATH=/
RUN pnpm --filter @workspace/closer run build
RUN pnpm --filter @workspace/api-server run build

FROM base AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget postgresql-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
ENV BASE_PATH=/

COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc /app/tsconfig.base.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/lib ./lib
COPY --from=deps /app/scripts ./scripts
COPY --from=deps /app/artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY --from=deps /app/artifacts/closer/package.json ./artifacts/closer/package.json
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/closer/dist/public ./artifacts/closer/dist/public
COPY docker/entrypoint.sh /entrypoint.sh

RUN sed -i 's/\r$//' /entrypoint.sh \
  && chmod +x /entrypoint.sh \
  && mkdir -p /data \
  && chown -R node:node /app /data /entrypoint.sh

USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5000/api/healthz || exit 1

ENTRYPOINT ["/entrypoint.sh"]
