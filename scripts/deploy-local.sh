#!/bin/bash
set -e

# =============================================================================
# deploy-local.sh — build the Atlas World images and deploy the FULL local stack
# to a LOCAL Kubernetes cluster:
#
#   cockroachdb      StatefulSet + PVC  (Nakama's database)
#   nakama           Deployment + migrate initContainer
#   colyseus-server  Deployment         (authoritative game sim)
#   asset-storybook  nginx Deployment   (asset/combat-lab review page)
#
# Invoked automatically by ps-release-workflow `ship` after a feature merges into
# release/<v> — treat merge-to-release like an MR merge that triggers a staging
# deploy, so the local env reflects the integrated release.
#
# Usage:
#   ./scripts/deploy-local.sh                     # full stack
#   ./scripts/deploy-local.sh --skip-storybook    # skip the 261 MB asset image
#   ./scripts/deploy-local.sh --skip-meta         # skip nakama + cockroachdb
#   ./scripts/deploy-local.sh --skip-server       # skip colyseus-server
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
DO_STORYBOOK=1
DO_META=1
DO_SERVER=1
for arg in "$@"; do
  case "$arg" in
    --skip-storybook) DO_STORYBOOK=0 ;;
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
SERVER_IMAGE="atlas-world-colyseus-server:local"
NAKAMA_IMAGE="atlas-world-nakama:local"
STORYBOOK_IMAGE="atlas-world-storybook:local"

# The storybook and nakama images rely on their own <dockerfile>.dockerignore,
# which only BuildKit honours. Without BuildKit the build silently falls back to
# the root .dockerignore — a whitelist scoped to the colyseus build — and produces
# an asset-less storybook. Force it on rather than trusting the daemon default.
export DOCKER_BUILDKIT=1

GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"

echo "======================================"
echo " Deploying Atlas World to Local K8s"
echo " commit: $GIT_SHA"
echo "======================================"

# --- Build --------------------------------------------------------------------
# Build context is the REPO ROOT for every image: this is a pnpm workspace whose
# packages depend on @atlas/contracts via `workspace:*`, and the storybook's asset
# paths escape its own directory.

if [ "$DO_SERVER" -eq 1 ]; then
  echo ""
  echo "▶ Building colyseus-server image ($SERVER_IMAGE)..."
  docker build --build-arg "GIT_SHA=$GIT_SHA" -t "$SERVER_IMAGE" \
    -f "$REPO_ROOT/colyseus-server/Dockerfile" "$REPO_ROOT"
  echo "  ✓ built"
fi

if [ "$DO_META" -eq 1 ]; then
  echo ""
  echo "▶ Building nakama image ($NAKAMA_IMAGE)..."
  docker build -t "$NAKAMA_IMAGE" \
    -f "$REPO_ROOT/nakama/Dockerfile" "$REPO_ROOT"
  echo "  ✓ built"
fi

if [ "$DO_STORYBOOK" -eq 1 ]; then
  echo ""
  echo "▶ Building storybook image ($STORYBOOK_IMAGE)..."
  echo "  (~261 MB of assets — the first build is slow; later ones reuse the layer)"
  docker build -t "$STORYBOOK_IMAGE" \
    -f "$REPO_ROOT/tools/asset-storybook/Dockerfile" "$REPO_ROOT"
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
[ "$DO_SERVER" -eq 1 ]    && kubectl apply -f "$REPO_ROOT/k8s/local/colyseus-server.yaml"
[ "$DO_STORYBOOK" -eq 1 ] && kubectl apply -f "$REPO_ROOT/k8s/local/storybook.yaml"

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
[ "$DO_SERVER" -eq 1 ]    && roll deployment colyseus-server 120s
[ "$DO_STORYBOOK" -eq 1 ] && roll deployment asset-storybook 120s

# --- Summary ------------------------------------------------------------------
echo ""
echo "======================================"
echo " Deployment Complete!"
echo "======================================"
if [ "$DO_SERVER" -eq 1 ]; then
  echo " Colyseus WS   : ws://localhost:2567/game"
  echo " Colyseus REST : http://localhost:2567/api   (health: /health)"
fi
[ "$DO_STORYBOOK" -eq 1 ] && \
  echo " Storybook     : http://localhost:6006/      (health: /healthz)"
if [ "$DO_META" -eq 1 ]; then
  echo " Nakama API    : http://localhost:7350       (health: /healthcheck)"
  echo " Nakama console: http://localhost:7351       (admin/password)"
fi
echo ""
echo " No LoadBalancer (e.g. kind)? Port-forward instead:"
[ "$DO_SERVER" -eq 1 ]    && echo "   kubectl -n $NAMESPACE port-forward deployment/colyseus-server 2567:2567"
[ "$DO_STORYBOOK" -eq 1 ] && echo "   kubectl -n $NAMESPACE port-forward deployment/asset-storybook 6006:80"
[ "$DO_META" -eq 1 ]      && echo "   kubectl -n $NAMESPACE port-forward deployment/nakama 7350:7350 7351:7351"
echo "======================================"
