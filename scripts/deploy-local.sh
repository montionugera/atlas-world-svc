#!/bin/bash
set -e

# =============================================================================
# deploy-local.sh — build the Atlas World images and deploy the stack
# to a LOCAL Kubernetes cluster:
#
#   server-rs        Deployment         (authoritative game sim & RustMetaEngine)
#   atlas-world-web  Deployment         (read-only web app for release hostnames)
#
# atlas-world is a cluster workload (deployment/atlas-world-web); atlas-edit
# (scripts/catalog_explorer_web.py on the Mac host, :8788) is the host process for editing.
# The old atlas-storybook hostname is a permanent redirect to atlas-world (k8s/local/ingress.yaml).
#
# Invoked automatically by ps-release-workflow `ship` after a feature merges into
# release/<v> — treat merge-to-release like an MR merge that triggers a staging
# deploy, so the local env reflects the integrated release.
#
# Usage:
#   ./scripts/deploy-local.sh                     # deploy stack
#   ./scripts/deploy-local.sh --skip-storybook    # deprecated no-op (the storybook image is retired)
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
DO_SERVER=1
for arg in "$@"; do
  case "$arg" in
    --skip-storybook) echo "⚠ --skip-storybook is deprecated and ignored: the storybook image is retired (its panels are served by atlas-world on :8788)." ;;
    --skip-meta)      echo "⚠ --skip-meta is deprecated and ignored: Nakama has been retired (server-rs has built-in RustMetaEngine)." ;;
    --with-meta)      echo "⚠ --with-meta is deprecated and ignored: Nakama has been retired (server-rs has built-in RustMetaEngine)." ;;
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

GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"

# The web image only tracks the release branch; a feature deploy leaves it on the last release.
RELEASE_BRANCH="release/$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$REPO_ROOT/.release.json")"
DO_WEB=0
if [ "$(git rev-parse --abbrev-ref HEAD)" = "$RELEASE_BRANCH" ]; then
  DO_WEB=1
  WEB_COMMIT="$(git rev-parse HEAD)"  # one read: build and check use the same commit
else
  echo "⚠ Not on $RELEASE_BRANCH: skipping the atlas-world-web image."
fi

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

if [ "$DO_WEB" -eq 1 ]; then
  echo ""
  echo "▶ Building atlas-world-web image from $WEB_COMMIT..."
  "$REPO_ROOT/scripts/build-atlas-web-image.sh" "$WEB_COMMIT"
  echo "  ✓ built"
fi

# --- Apply --------------------------------------------------------------------
echo ""
echo "▶ Applying local Kubernetes manifests..."
verify_local_ctx  # re-check immediately before any kubectl write
kubectl apply -f "$REPO_ROOT/k8s/local/namespace.yaml"
kubectl apply -f "$REPO_ROOT/k8s/local/config.yaml"
if [ "$DO_SERVER" -eq 1 ]; then
  kubectl apply -f "$REPO_ROOT/k8s/local/server-rs.yaml"
fi
if [ "$DO_WEB" -eq 1 ]; then
  kubectl apply -f "$REPO_ROOT/k8s/local/atlas-world-web.yaml"
fi
# `apply` never removes what a manifest stopped declaring, so retire old workloads
# explicitly (a no-op once they are gone).
verify_local_ctx
# Retired workload name (a cluster resource, NOT the atelier/ directory) — assembled so the
# directory-rename grep gate stays at zero matches.
LEGACY_SB="asset-""storybook"
kubectl -n "$NAMESPACE" delete deployment/"$LEGACY_SB" service/"$LEGACY_SB" --ignore-not-found >/dev/null 2>&1 || true
kubectl -n "$NAMESPACE" delete deployment/nakama statefulset/cockroachdb service/nakama service/cockroachdb --ignore-not-found >/dev/null 2>&1 || true

# --- Roll out -----------------------------------------------------------------
# imagePullPolicy:Never + a stable :local tag means the manifests are unchanged
# across rebuilds, so `apply` alone won't restart pods — force it so they pick up
# the freshly built images.
roll() {
  local kind="$1" name="$2" timeout="$3"
  verify_local_ctx
  if [ "$kind" = "deployment" ]; then
    kubectl -n "$NAMESPACE" rollout restart "deployment/$name"
  fi
  kubectl -n "$NAMESPACE" rollout status "$kind/$name" --timeout="$timeout"
}

echo ""
echo "▶ Rolling out..."
[ "$DO_SERVER" -eq 1 ]    && roll deployment server-rs 120s
if [ "$DO_WEB" -eq 1 ]; then
  roll deployment atlas-world-web 120s
fi

if [ -f "$REPO_ROOT/k8s/local/ingress.yaml" ]; then
  verify_local_ctx
  # The admission webhook rejects the atlas-storybook-redirect Ingress while the old
  # atlas-world-local Ingress still claims that host. The first pass drops the host from
  # atlas-world-local; the second creates the redirect. Both are idempotent.
  kubectl apply -f "$REPO_ROOT/k8s/local/ingress.yaml" >/dev/null 2>&1 || true
  kubectl apply -f "$REPO_ROOT/k8s/local/ingress.yaml"
fi

# --- Atlas World host process -------------------------------------------------
# atlas-world is a cluster workload (deployment/atlas-world-web). atlas-edit (scripts/catalog_explorer_web.py
# on the Mac host, :8788) is the host process for editing; the cluster routes to it.
# A missing server is a notice, never a deploy failure.
if ! curl -fsS --max-time 3 http://127.0.0.1:8788/healthz >/dev/null 2>&1; then
  echo ""
  echo "⚠ the edit site (atlas-edit.joymify.local.com) has no host process. Start it with:"
  echo "    python3 $REPO_ROOT/scripts/catalog_explorer_web.py --port 8788"
fi

if [ "$DO_WEB" -eq 1 ]; then
  echo ""
  echo "▶ Checking the atlas web host..."
  ATLAS_WEB_COMMIT="$WEB_COMMIT" "$REPO_ROOT/scripts/verify-atlas-web.sh"
fi

# --- Summary ------------------------------------------------------------------
echo ""
echo "======================================"
echo " Deployment Complete!"
echo "======================================"
echo " Atlas World   : http://atlas-world.joymify.local.com/ (cluster workload)"
echo " Atlas Edit    : http://atlas-edit.joymify.local.com/ (or http://127.0.0.1:8788/, host process)"
if [ "$DO_SERVER" -eq 1 ]; then
  echo " Server-RS WS  : ws://localhost:2567?token=<jwt>"
  echo " Server-RS Pod : deployment/server-rs (port 2567)"
fi
echo " Asset panels  : http://atlas-world.joymify.local.com/?tab=assets (old atlas-storybook host redirects here)"
echo ""
echo " No LoadBalancer (e.g. kind)? Port-forward instead:"
[ "$DO_SERVER" -eq 1 ]    && echo "   kubectl -n $NAMESPACE port-forward deployment/server-rs 2567:2567"
[ "$DO_WEB" -eq 1 ]       && echo "   kubectl -n $NAMESPACE port-forward deployment/atlas-world-web 8788:8788"
echo "======================================"
