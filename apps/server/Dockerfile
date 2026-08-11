FROM node:22.22.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ make python3 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
ARG PRISMA_SCHEMA=prisma/schema.prisma
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/tsconfig.json ./apps/server/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/mahjong-core/package.json packages/mahjong-core/tsconfig.json ./packages/mahjong-core/
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY apps/server/src ./apps/server/src
COPY packages/shared/src ./packages/shared/src
COPY packages/mahjong-core/src ./packages/mahjong-core/src
RUN pnpm prisma:generate --schema ./${PRISMA_SCHEMA} && pnpm --filter server... build

FROM base AS production-dependencies
ARG PRISMA_SCHEMA=prisma/schema.prisma
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/mahjong-core/package.json ./packages/mahjong-core/package.json
COPY prisma ./prisma
RUN pnpm install --prod --frozen-lockfile \
  && pnpm prisma generate --schema ./${PRISMA_SCHEMA}

FROM node:22.22.0-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg openssl \
  && install -d /etc/apt/keyrings \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=production-dependencies /app/packages ./packages
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/mahjong-core/dist ./packages/mahjong-core/dist
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/mahjong-core/package.json ./packages/mahjong-core/package.json
COPY --from=build /app/prisma ./prisma
COPY --chmod=755 apps/server/docker-entrypoint.sh ./apps/server/docker-entrypoint.sh
RUN mkdir -p /app/data /app/backups \
  && chown -R node:node /app/data /app/backups /app/prisma
USER node
EXPOSE 3000
ENTRYPOINT ["./apps/server/docker-entrypoint.sh"]
