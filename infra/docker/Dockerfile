# syntax=docker/dockerfile:1
FROM node:24.22.0-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 AS node

FROM node AS manifests
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@10.34.7
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/backend/package.json packages/backend/package.json

FROM manifests AS dependencies
RUN --mount=type=cache,id=vip-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps apps
COPY packages packages
RUN pnpm build

# Separate frozen installs retain the workspace layout and exact lockfile graph.
# Only each service's production dependency closure reaches its final image.
FROM manifests AS api-dependencies
RUN --mount=type=cache,id=vip-pnpm,target=/pnpm/store \
    pnpm --filter @vip/api... install --prod --frozen-lockfile --store-dir=/pnpm/store

FROM manifests AS worker-dependencies
RUN --mount=type=cache,id=vip-pnpm,target=/pnpm/store \
    pnpm --filter @vip/worker... install --prod --frozen-lockfile --store-dir=/pnpm/store

FROM node AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Docker copies this ownership into a new named volume. Both services use UID
# 1000, but the worker's volume mount is read-only, including staging files.
RUN mkdir -p /data/images && chown node:node /data/images && chmod 700 /data/images
USER node

FROM runtime AS api
COPY --from=api-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=api-dependencies --chown=node:node /workspace/apps/api ./apps/api
COPY --from=api-dependencies --chown=node:node /workspace/packages ./packages
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/packages/backend/dist ./packages/backend/dist
COPY --from=build --chown=node:node /workspace/packages/contracts/dist ./packages/contracts/dist
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]

FROM runtime AS worker
COPY --from=worker-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=worker-dependencies --chown=node:node /workspace/apps/worker ./apps/worker
COPY --from=worker-dependencies --chown=node:node /workspace/packages ./packages
COPY --from=build --chown=node:node /workspace/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=node:node /workspace/packages/backend/dist ./packages/backend/dist
COPY --from=build --chown=node:node /workspace/packages/contracts/dist ./packages/contracts/dist
CMD ["node", "apps/worker/dist/main.js"]

FROM nginxinc/nginx-unprivileged:1.30.2-alpine@sha256:de3e40ec8b7debd7194fc798d4bbfb102c7f8b012b2c73032816b5f72393acdd AS web
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
