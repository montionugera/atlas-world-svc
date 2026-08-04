# Atlas World Asset Storybook — static nginx image.
#
# Build context is the REPO ROOT. The storybook's index.html loads assets via
# relative paths that escape its own directory:
#   ../../game-client/assets/…, ../../colyseus-server/generated/…, ../combat-lab/…
# so the document root has to be the repo root with the original layout
# preserved, and the page keeps its real path (/tools/asset-storybook/index.html).
#
# The root .dockerignore is a whitelist scoped to the colyseus build and excludes
# game-client/ and tools/ entirely. This image uses the sibling
# Dockerfile.dockerignore instead, which BuildKit prefers over the root file —
# hence deploy-local.sh sets DOCKER_BUILDKIT=1 explicitly. A non-BuildKit build
# would silently fall back to the root whitelist and produce an asset-less image.

FROM nginx:1.27-alpine

WORKDIR /usr/share/nginx/html

# Assets first, in a layer of their own: ~261 MB that changes rarely. Keeping it
# ahead of the small, frequently-edited files means a storybook or combat-lab
# edit reuses this cached layer instead of re-copying a quarter gigabyte on every
# ship. Do NOT fold this into a later COPY.
COPY game-client/assets game-client/assets

# Small and frequently edited — these come last so they invalidate as little as
# possible.
COPY colyseus-server/generated/asset-keys.json colyseus-server/generated/asset-keys.json
COPY tools/combat-lab tools/combat-lab
COPY tools/asset-storybook tools/asset-storybook

# The config lives under k8s/local/ rather than beside this Dockerfile so it does
# not end up served inside the document root.
COPY k8s/local/storybook-nginx.conf /etc/nginx/conf.d/default.conf

# .glb/.gltf are not in nginx's default mime.types; without this they are served
# as application/octet-stream. That happens to work for ArrayBuffer loaders, but
# the correct type is cheap and avoids a puzzling class of loader warnings.
#
# .mjs is NOT a cosmetic case like glb/gltf above: default mime.types maps .js
# to application/javascript but has no .mjs entry at all, so index.html's
# `<script type="module" src="./js/main.mjs">` (Task 9's module split) would
# get served as application/octet-stream — which Chrome/Firefox refuse to
# execute as a module script, breaking the page in the container while local
# dev (python3 -m http.server, whose mimetypes module already knows .mjs)
# works fine. Confirmed by building and running this image before adding the
# line below: 0 sidebar sections rendered.
#
# These must be inserted INSIDE the `types { … }` block — appending to the end of
# the file lands after its closing brace and makes the config invalid. Insert
# before the final `}`, then let `nginx -t` prove the result parses.
RUN sed -i '$ i \    model/gltf-binary                      glb;\n    model/gltf+json                        gltf;\n    text/javascript                        mjs;' /etc/nginx/mime.types \
 && nginx -t

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=3s --retries=3 \
  CMD wget -q --spider http://localhost/healthz || exit 1
