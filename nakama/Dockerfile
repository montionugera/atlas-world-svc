# Atlas World Nakama runtime image.
#
# Build context is the REPO ROOT: the JS runtime depends on @atlas/contracts via
# the `workspace:*` protocol, which pnpm cannot resolve inside a nakama/-only
# context (and which npm cannot resolve at all — EUNSUPPORTEDPROTOCOL).
#
# docker-compose.yml runs Nakama off bind mounts (./nakama → /nakama/data). k8s
# has no equivalent, so this image bakes the same two files into the same paths:
#   nakama/build/index.js -> /nakama/data/modules/index.js
#   nakama/local.yml      -> /nakama/data/local.yml
#
# Uses the sibling Dockerfile.dockerignore (BuildKit prefers it over the root
# .dockerignore); deploy-local.sh sets DOCKER_BUILDKIT=1 explicitly.

# heroiclabs publishes no arm64 image for 3.21.1 (see stage 2). An ARG consumed
# by a FROM must be declared before the FIRST FROM to be in the global scope —
# declaring it next to the stage that uses it yields "empty platform value".
ARG NAKAMA_PLATFORM=linux/amd64

# --- Stage 1: bundle the JS runtime -------------------------------------------
FROM node:22-alpine AS builder
RUN npm install -g pnpm@9
# puppeteer (transitive dev dep) must not try to fetch Chromium in-image
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
WORKDIR /repo
# Manifests first so the install layer caches independently of source edits.
# All three workspace package.jsons are needed for --frozen-lockfile to agree
# with pnpm-lock.yaml (same set the colyseus-server Dockerfile copies).
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY contracts/package.json contracts/
COPY colyseus-server/package.json colyseus-server/
COPY nakama/package.json nakama/
RUN pnpm install --frozen-lockfile --filter @atlas/nakama-runtime...
COPY contracts contracts
COPY nakama nakama
# contracts resolves from dist/ (no prepare hook), so build it before the bundle
RUN pnpm --filter @atlas/contracts run build \
 && pnpm --filter @atlas/nakama-runtime run build

# --- Stage 2: Nakama with the bundled module ----------------------------------
# Left implicit, a build on Apple Silicon pulls amd64 anyway and only warns;
# pinning the platform makes that deterministic. The pod runs emulated on arm64
# nodes — same as docker-compose today. Routed through the global ARG declared at
# the top because BuildKit lints a constant --platform
# (FromPlatformFlagConstDisallowed), and so a caller can override it if
# heroiclabs ever ships arm64.
FROM --platform=$NAKAMA_PLATFORM heroiclabs/nakama:3.21.1

# esbuild emits a flat, unwrapped script (see nakama/esbuild.config.mjs) because
# Nakama's goja runtime loads it as a plain script and looks up a top-level
# InitModule — it is not a module loader.
COPY --from=builder /repo/nakama/build/index.js /nakama/data/modules/index.js
COPY nakama/local.yml /nakama/data/local.yml

EXPOSE 7349 7350 7351
