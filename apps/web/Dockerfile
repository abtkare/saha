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

# التطبيق (الجلسة 7): حزمة Expo مبنية مسبقاً يقدّمها الموقع على /expo لتطبيق Expo Go
FROM node:22-bookworm-slim AS mobile
ENV CI=1 EXPO_NO_TELEMETRY=1
WORKDIR /repo
COPY packages/shared/src packages/shared/src
COPY packages/ui/src packages/ui/src
COPY apps/mobile/package.json apps/mobile/package-lock.json* apps/mobile/
RUN cd apps/mobile && npm install --no-audit --no-fund
COPY apps/mobile apps/mobile
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
 && apps/mobile/scripts/build-expo-go.sh

FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TZ=Asia/Baghdad PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=mobile /repo/apps/mobile/dist ./apps/web/public/expo-app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
