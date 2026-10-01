# Talkel web (Next.js) for Cloud Run. API_INTERNAL_URL is baked into the /v1 rewrite at build time.
#   docker build -f deploy/web.Dockerfile --build-arg API_INTERNAL_URL=https://api-xyz.a.run.app \
#     --build-arg NEXT_PUBLIC_WEB_URL=https://talkel.app -t talkel-web .
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter "@speakai/web..."
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
ARG API_INTERNAL_URL
ARG NEXT_PUBLIC_WEB_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL NEXT_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @speakai/contracts build && pnpm --filter @speakai/web build

FROM node:24-slim
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
