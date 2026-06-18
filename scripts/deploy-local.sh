#!/bin/bash
set -e

# =============================================================================
# deploy-local.sh — build the Atlas World Colyseus server image and deploy it to
# a LOCAL Kubernetes cluster. Modeled on the quant repo's scripts/deploy-local.sh
# (same local-context safety guard + worktree-aware build context).
#
# Usage:
#   ./scripts/deploy-local.sh
#   LOCAL_CTX_PATTERN=mylocal ./scripts/deploy-local.sh   # custom local ctx name
# =============================================================================

# --- Safety: refuse to run against a non-local kubectl context ----------------
# Local-flavor manifests use image: atlas-world-colyseus-server:local with
# imagePullPolicy: Never — applying them to a real cluster would create
# permanently-ImagePullBackOff pods. This guard checks the context up front AND
# again before every kubectl write, because IDE/Lens can switch context mid-run.
LOCAL_CTX_PATTERN="${LOCAL_CTX_PATTERN:-orbstack|kind-|minikube|docker-desktop|rancher-desktop|colima}"
verify_local_ctx() {
  local ctx
  ctx=$(kubectl config current-context)
  if [[ ! "$ctx" =~ $LOCAL_CTX_PATTERN ]]; then
    echo "❌ deploy-local.sh refuses to run against kubectl context '$ctx'."
    echo "   It applies local-only manifests (image:local, imagePullPolicy:Never)."
    echo "   Switch to your local cluster first:"
    echo "     kubectl config get-contexts"
    echo "     kubectl config use-context <orbstack|kind-…|minikube|docker-desktop>"
    echo "   Or override the pattern if your local cluster has a different name:"
    echo "     LOCAL_CTX_PATTERN=mylocal ./scripts/deploy-local.sh"
    exit 1
  fi
}
verify_local_ctx
echo "✅ Cluster context: $(kubectl config current-context)"

# --- Worktree-aware paths -----------------------------------------------------
# Works from the primary checkout or any linked git worktree — the working tree
# we are in is what gets built and deployed.
REPO_ROOT="$(git rev-parse --show-toplevel)"
MAIN_ROOT="$(git worktree list --porcelain | awk 'NR==1{print $2}')"
echo "📂 Working tree: $REPO_ROOT"
[ "$REPO_ROOT" != "$MAIN_ROOT" ] && echo "   ↳ linked worktree (primary checkout: $MAIN_ROOT)"

IMAGE="atlas-world-colyseus-server:local"
NAMESPACE="atlas-world"
DEPLOYMENT="colyseus-server"

echo "======================================"
echo " Deploying Atlas World to Local K8s "
echo "======================================"

echo "[1/4] Building Docker image ($IMAGE)..."
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
# Build context is colyseus-server/ (matches docker-compose.yml + the Dockerfile's
# COPY paths). GIT_SHA is passed for traceability if the Dockerfile wants it.
docker build --build-arg "GIT_SHA=$GIT_SHA" -t "$IMAGE" "$REPO_ROOT/colyseus-server"
echo "  ✓ image built ($GIT_SHA)"

echo "[2/4] Applying local Kubernetes manifests..."
verify_local_ctx  # re-check immediately before any kubectl write
kubectl apply -f "$REPO_ROOT/k8s/local/namespace.yaml"
kubectl apply -f "$REPO_ROOT/k8s/local/config.yaml"
kubectl apply -f "$REPO_ROOT/k8s/local/colyseus-server.yaml"

echo "[3/4] Rolling out the new image..."
verify_local_ctx
# imagePullPolicy:Never + a stable :local tag means the manifest is unchanged
# across rebuilds, so `apply` alone won't restart pods — force it to pick up the
# freshly built image.
kubectl -n "$NAMESPACE" rollout restart "deployment/$DEPLOYMENT"
kubectl -n "$NAMESPACE" rollout status "deployment/$DEPLOYMENT" --timeout=120s

echo "[4/4] Done."
echo "======================================"
echo " Deployment Complete!"
echo " WebSocket : ws://localhost:2567/game   (LoadBalancer on docker-desktop/OrbStack)"
echo " REST API  : http://localhost:2567/api"
echo " Health    : http://localhost:2567/health"
echo ""
echo " If your cluster has no LoadBalancer (e.g. kind), port-forward instead:"
echo "   kubectl -n $NAMESPACE port-forward deployment/$DEPLOYMENT 2567:2567"
echo "======================================"
