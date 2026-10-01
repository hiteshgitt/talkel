# Talkel API (+ in-process analysis worker) for Cloud Run.
# Build from the repo root:  docker build -f deploy/api.Dockerfile -t talkel-api .
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter "@speakai/api..."
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @speakai/contracts build \
 && pnpm --filter @speakai/db build \
 && pnpm --filter @speakai/api build \
 && pnpm --filter @speakai/api deploy --legacy --prod /out \
 && cp -r packages/db/prisma packages/db/prisma7.config.ts /out/node_modules/@speakai/db/ 2>/dev/null || true

FROM node:24-slim
ENV NODE_ENV=production PORT=8080 DOTENV_PATH=/nonexistent/.env
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
