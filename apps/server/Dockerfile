# Build context is the REPO ROOT (release workflow: context ".", file "apps/server/Dockerfile").
# Image: ghcr.io/macroxie04/qurasearch-server

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Extension manifest is copied so npm can resolve the full workspace graph.
COPY apps/extension/package.json apps/extension/
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm ci -w apps/server -w packages/shared --ignore-scripts
RUN npm run build -w packages/shared && npm run build -w apps/server

FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/extension/package.json apps/extension/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
# npm runs workspace `prepare` hooks even under --ignore-scripts; shared's
# prepare needs tsc, which --omit=dev excludes — drop the hook (dist comes
# from the build stage).
RUN npm pkg delete scripts.prepare -w packages/shared \
  && npm ci -w apps/server -w packages/shared --omit=dev --ignore-scripts

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
# node_modules/@qurasearch/shared is a workspace symlink to /app/packages/shared,
# so the shared dist must exist in the runtime image.
COPY --from=prod-deps /app/node_modules node_modules
COPY packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
USER node
EXPOSE 8787
HEALTHCHECK CMD wget -qO- "http://127.0.0.1:${PORT:-8787}/health" || exit 1
CMD ["node", "apps/server/dist/index.js"]
