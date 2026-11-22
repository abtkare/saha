# صورة خادم «ساحة» — تُبنى من جذر المستودع: docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json pnpm-lock.yaml* ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm install --filter "@saha/api..." --no-frozen-lockfile
RUN pnpm --filter @saha/shared build && pnpm --filter @saha/api build

FROM base AS run
ENV NODE_ENV=production TZ=Asia/Baghdad PORT=3001
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# يطبّق الـ migrations، ثم يزرع البيانات الأولية إن لزم، ثم يشغّل الخادم
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/prisma/seed.js && node dist/src/main.js"]
