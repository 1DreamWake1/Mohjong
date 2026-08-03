FROM node:22.22.0-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html ./apps/web/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
RUN pnpm install --frozen-lockfile
COPY apps/web/src ./apps/web/src
COPY packages/shared/src ./packages/shared/src
RUN pnpm --filter web build

FROM nginx:1.28.0-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html \
  && sed -i '/^user /d' /etc/nginx/nginx.conf \
  && touch /var/run/nginx.pid \
  && chown nginx:nginx /var/run/nginx.pid \
  && chown -R nginx:nginx /var/cache/nginx
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]
