# Atlas World Colyseus Server — multi-stage build.
#
# Build context is the REPO ROOT (see docker-compose.yml / deploy-local.sh and
# the root .dockerignore whitelist): this is a pnpm workspace and the server
# depends on @atlas/contracts via `workspace:*`, which npm cannot resolve and
# which does not exist inside a colyseus-server/-only context.

# --- Stage 1: build (workspace install + contracts build + tsc) ---------------
FROM node:22-alpine AS builder
RUN npm install -g pnpm@9
# puppeteer (transitive dev dep) must not try to fetch Chromium in-image
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY contracts/package.json contracts/
COPY colyseus-server/package.json colyseus-server/
COPY nakama/package.json nakama/
RUN pnpm install --frozen-lockfile --filter atlas-world-colyseus-server...
COPY contracts contracts
COPY colyseus-server colyseus-server
# contracts resolves from dist/ (no prepare hook), so build it before the server
RUN pnpm --filter @atlas/contracts run build \
 && pnpm --filter atlas-world-colyseus-server run build

# --- Stage 2: runtime (prod workspace install + built dist only) --------------
FROM node:22-alpine AS runtime
RUN npm install -g pnpm@9
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY contracts/package.json contracts/
COPY colyseus-server/package.json colyseus-server/
COPY nakama/package.json nakama/
# husky (devDep) runs via `prepare` and breaks a --prod install; strip the hook in-image
RUN node -e "const f='colyseus-server/package.json',fs=require('fs'),p=JSON.parse(fs.readFileSync(f));delete p.scripts.prepare;fs.writeFileSync(f,JSON.stringify(p,null,2))" \
 && pnpm install --frozen-lockfile --prod --filter atlas-world-colyseus-server... \
 && pnpm store prune && npm cache clean --force
COPY --from=builder /repo/contracts/dist contracts/dist
COPY --from=builder /repo/contracts/content contracts/content
COPY --from=builder /repo/colyseus-server/dist colyseus-server/dist
WORKDIR /repo/colyseus-server

EXPOSE 2567

# node:22-alpine has no curl; use busybox wget for the health probe.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:2567/health || exit 1

CMD ["node", "dist/index.js"]
