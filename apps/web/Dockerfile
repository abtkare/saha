# صورة موقع «ساحة» — تُبنى من جذر المستودع: docker build -f apps/web/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json pnpm-lock.yaml* ./
COPY packages packages
COPY apps/web apps/web
RUN pnpm install --filter "@saha/web..." --no-frozen-lockfile
RUN pnpm --filter @saha/shared build && pnpm --filter @saha/ui build && pnpm --filter @saha/web build

FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TZ=Asia/Baghdad PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
