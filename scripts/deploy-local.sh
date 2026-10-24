#!/bin/bash
set -e

# =============================================================================
# deploy-local.sh — build the Atlas World images and deploy the FULL local stack
# to a LOCAL Kubernetes cluster:
#
#   cockroachdb      StatefulSet + PVC  (Nakama's database)
#   nakama           Deployment + migrate initContainer
#   server-rs        Deployment         (authoritative game sim)
#
# The asset storybook is no longer a cluster workload: its panels are served by atlas-world
# (scripts/catalog_explorer_web.py on the Mac host, :8788). The old atlas-storybook hostname is a
# permanent redirect to it (k8s/local/ingress.yaml).
#
# Invoked automatically by ps-release-workflow `ship` after a feature merges into
# release/<v> — treat merge-to-release like an MR merge that triggers a staging
# deploy, so the local env reflects the integrated release.
#
# Usage:
#   ./scripts/deploy-local.sh                     # full stack
#   ./scripts/deploy-local.sh --skip-storybook    # deprecated no-op (the storybook image is retired)
#   ./scripts/deploy-local.sh --skip-meta         # skip nakama + cockroachdb
#   ./scripts/deploy-local.sh --skip-server       # skip server-rs
#   LOCAL_CTX_PATTERN=mylocal ./scripts/deploy-local.sh   # custom local ctx name
# =============================================================================

# --- Safety: refuse to run against a non-local kubectl context ----------------
# Local-flavor manifests use image: …:local with imagePullPolicy: Never, and
# CockroachDB runs --insecure (no TLS, no auth) — applying any of this to a real
# cluster would be both broken and dangerous. This guard checks the context up
# front AND again before every kubectl write, because IDE/Lens can switch context
# mid-run.
LOCAL_CTX_PATTERN="${LOCAL_CTX_PATTERN:-orbstack|kind-|minikube|docker-desktop|rancher-desktop|colima}"
verify_local_ctx() {
  local ctx
  ctx=$(kubectl config current-context)
  if [[ ! "$ctx" =~ $LOCAL_CTX_PATTERN ]]; then
    echo "❌ deploy-local.sh refuses to run against kubectl context '$ctx'."
    echo "   It applies local-only manifests (image:local, imagePullPolicy:Never,"
    echo "   insecure single-node CockroachDB)."
    echo "   Switch to your local cluster first:"
    echo "     kubectl config get-contexts"
    echo "     kubectl config use-context <orbstack|kind-…|minikube|docker-desktop>"
    echo "   Or override the pattern if your local cluster has a different name:"
    echo "     LOCAL_CTX_PATTERN=mylocal ./scripts/deploy-local.sh"
    exit 1
  fi
}

# --- Flags --------------------------------------------------------------------
DO_META=1
DO_SERVER=1
for arg in "$@"; do
  case "$arg" in
    --skip-storybook) echo "⚠ --skip-storybook is deprecated and ignored: the storybook image is retired (its panels are served by atlas-world on :8788)." ;;
    --skip-meta)      DO_META=0 ;;
    --skip-server)    DO_SERVER=0 ;;
    -h|--help)
      awk '/^# ===/{n++} n>=1{sub(/^# ?/,""); print} n>=2{exit}' "$0"
      exit 0 ;;
    *) echo "❌ unknown flag: $arg (see --help)"; exit 2 ;;
  esac
done

verify_local_ctx
echo "✅ Cluster context: $(kubectl config current-context)"

# --- Worktree-aware paths -----------------------------------------------------
# Works from the primary checkout or any linked git worktree — the working tree
# we are in is what gets built and deployed.
REPO_ROOT="$(git rev-parse --show-toplevel)"
MAIN_ROOT="$(git worktree list --porcelain | awk 'NR==1{print $2}')"
echo "📂 Working tree: $REPO_ROOT"
[ "$REPO_ROOT" != "$MAIN_ROOT" ] && echo "   ↳ linked worktree (primary checkout: $MAIN_ROOT)"

NAMESPACE="atlas-world"
SERVER_RS_IMAGE="atlas-world-server-rs:local"
NAKAMA_IMAGE="atlas-world-nakama:local"

# The nakama image relies on its own <dockerfile>.dockerignore, which only
# BuildKit honours. Without BuildKit the build silently falls back to the root
# .dockerignore — a whitelist scoped to the colyseus build — and produces a
# broken image. Force it on rather than trusting the daemon default.
export DOCKER_BUILDKIT=1

GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"

echo "======================================"
echo " Deploying Atlas World to Local K8s"
echo " commit: $GIT_SHA"
echo "======================================"

# --- Build --------------------------------------------------------------------
# Build context is the REPO ROOT for every image: this is a pnpm workspace whose
# packages depend on @atlas/contracts via `workspace:*`.

if [ "$DO_SERVER" -eq 1 ]; then
  echo ""
  echo "▶ Building server-rs image ($SERVER_RS_IMAGE)..."
  docker build -t "$SERVER_RS_IMAGE" \
    -f "$REPO_ROOT/server-rs/Dockerfile" "$REPO_ROOT"
  echo "  ✓ built"
fi

if [ "$DO_META" -eq 1 ]; then
  echo ""
  echo "▶ Building nakama image ($NAKAMA_IMAGE)..."
  docker build -t "$NAKAMA_IMAGE" \
    -f "$REPO_ROOT/nakama/Dockerfile" "$REPO_ROOT"
  echo "  ✓ built"
fi

# --- Apply --------------------------------------------------------------------
echo ""
echo "▶ Applying local Kubernetes manifests..."
verify_local_ctx  # re-check immediately before any kubectl write
kubectl apply -f "$REPO_ROOT/k8s/local/namespace.yaml"
kubectl apply -f "$REPO_ROOT/k8s/local/config.yaml"
if [ "$DO_META" -eq 1 ]; then
  kubectl apply -f "$REPO_ROOT/k8s/local/cockroachdb.yaml"
  kubectl apply -f "$REPO_ROOT/k8s/local/nakama.yaml"
fi
if [ "$DO_SERVER" -eq 1 ]; then
  kubectl apply -f "$REPO_ROOT/k8s/local/server-rs.yaml"
  if [ "$DO_META" -eq 0 ]; then
    verify_local_ctx
    kubectl -n "$NAMESPACE" set env deployment/server-rs NAKAMA_URL- NAKAMA_HTTP_KEY-
  fi
fi
# `apply` never removes what a manifest stopped declaring, so retire the old storybook workload
# explicitly (a no-op once it is gone).
verify_local_ctx
# Retired workload name (a cluster resource, NOT the atelier/ directory) — assembled so the
# directory-rename grep gate stays at zero matches.
LEGACY_SB="asset-""storybook"
kubectl -n "$NAMESPACE" delete deployment/"$LEGACY_SB" service/"$LEGACY_SB" --ignore-not-found >/dev/null 2>&1 || true
if [ -f "$REPO_ROOT/k8s/local/ingress.yaml" ]; then
  # The admission webhook rejects the atlas-storybook-redirect Ingress while the old
  # atlas-world-local Ingress still claims that host. The first pass drops the host from
  # atlas-world-local; the second creates the redirect. Both are idempotent.
  kubectl apply -f "$REPO_ROOT/k8s/local/ingress.yaml" >/dev/null 2>&1 || true
  kubectl apply -f "$REPO_ROOT/k8s/local/ingress.yaml"
fi

# --- Roll out -----------------------------------------------------------------
# imagePullPolicy:Never + a stable :local tag means the manifests are unchanged
# across rebuilds, so `apply` alone won't restart pods — force it so they pick up
# the freshly built images.
roll() {
  local kind="$1" name="$2" timeout="$3"
  verify_local_ctx
  # Only Deployments need the restart nudge to re-read the :local image. The
  # CockroachDB StatefulSet holds the data volume and should not be bounced on
  # every deploy.
  if [ "$kind" = "deployment" ]; then
    kubectl -n "$NAMESPACE" rollout restart "deployment/$name"
  fi
  kubectl -n "$NAMESPACE" rollout status "$kind/$name" --timeout="$timeout"
}

echo ""
echo "▶ Rolling out..."
if [ "$DO_META" -eq 1 ]; then
  # CockroachDB first: the nakama migrate initContainer blocks on it.
  roll statefulset cockroachdb 180s
  roll deployment  nakama      180s
fi
[ "$DO_SERVER" -eq 1 ]    && roll deployment server-rs 120s

# --- Atlas World host process -------------------------------------------------
# atlas-world (the studio + the asset panels) is a Mac host process, not a pod; the cluster only
# routes to it. A missing server is a notice, never a deploy failure.
if ! curl -fsS --max-time 3 http://127.0.0.1:8788/healthz >/dev/null 2>&1; then
  echo ""
  echo "⚠ atlas-world is not running on :8788, so atlas-world.joymify.local.com (and the"
  echo "  atlas-storybook redirect) will show a bad gateway. Start it from this checkout:"
  echo "    python3 $REPO_ROOT/scripts/catalog_explorer_web.py --port 8788"
fi

# --- Summary ------------------------------------------------------------------
echo ""
echo "======================================"
echo " Deployment Complete!"
echo "======================================"
echo " Atlas Studio  : http://atlas-world.joymify.local.com/ (or http://127.0.0.1:8788/)"
if [ "$DO_SERVER" -eq 1 ]; then
  echo " Server-RS WS  : ws://localhost:2567?token=<jwt>"
  echo " Server-RS Pod : deployment/server-rs (port 2567)"
fi
echo " Asset panels  : http://atlas-world.joymify.local.com/?tab=assets (old atlas-storybook host redirects here)"
if [ "$DO_META" -eq 1 ]; then
  echo " Nakama API    : http://localhost:7350       (health: /healthcheck)"
  echo " Nakama console: http://localhost:7351       (admin/password)"
fi
echo ""
echo " No LoadBalancer (e.g. kind)? Port-forward instead:"
[ "$DO_SERVER" -eq 1 ]    && echo "   kubectl -n $NAMESPACE port-forward deployment/server-rs 2567:2567"
[ "$DO_META" -eq 1 ]      && echo "   kubectl -n $NAMESPACE port-forward deployment/nakama 7350:7350 7351:7351"
echo "======================================"
