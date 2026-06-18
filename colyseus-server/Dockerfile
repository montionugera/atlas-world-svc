# Atlas World Colyseus Server — multi-stage build.
#
# Build context is colyseus-server/ (see docker-compose.yml / deploy-local.sh).
# This is a pnpm workspace, so there is no package-lock.json in this package;
# we use `npm install` from package.json rather than `npm ci`.

# --- Stage 1: build (needs devDependencies for tsc) ---------------------------
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build   # tsc -> dist/

# --- Stage 2: runtime (production deps + compiled output only) -----------------
FROM node:18-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

EXPOSE 2567

# node:18-alpine has no curl; use busybox wget for the health probe.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:2567/health || exit 1

CMD ["node", "dist/index.js"]
