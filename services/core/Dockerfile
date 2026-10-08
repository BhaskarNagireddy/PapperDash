# syntax=docker/dockerfile:1.7
# PapperDash core API. Build from the repository root:
#   docker build -f services/core/Dockerfile -t papperdash-core .
# Base images come from AWS's public mirror of the official images (no Docker Hub rate limits in AWS).

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY services/core/package.json services/core/
RUN pnpm install --frozen-lockfile --filter "@papperdash/core..."
COPY packages/contracts packages/contracts
COPY services/core services/core
RUN pnpm --filter @papperdash/contracts build \
 && pnpm --filter @papperdash/core build \
 && pnpm --filter @papperdash/core deploy --prod --legacy /out

FROM public.ecr.aws/docker/library/node:22-bookworm-slim
# LibreOffice (Writer, Calc, Impress, no GUI) converts Word/Excel/PowerPoint uploads to PDF; fonts keep layouts faithful.
# tini forwards signals so ECS can stop the container gracefully during rolling deploys.
# npm, npx and corepack are removed: the app never uses them at runtime, so they would only add attack surface
# (the vulnerability scan flags packages bundled inside npm itself).
RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      fonts-dejavu-core fonts-liberation2 tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production \
    PORT=4000 \
    HOME=/tmp
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Never run as root inside the container.
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# Migrations run once per deploy as a separate ECS task: node dist/migrate.js
CMD ["node", "dist/main.js"]
