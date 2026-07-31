---
title: "Local k8s: add Ingress so services have portless hostnames"
id: I-045
status: idea
source: "Observed while exercising the F-023 local deploy, 2026-07-31"
---

# Local k8s: add Ingress so services have portless hostnames

## Problem

`k8s/local/` exposes every service as a bare `LoadBalancer` and there is **no Ingress at
all** — `kubectl -n atlas-world get ingress` returns `No resources found`.

That means the only way to reach a service is host **plus port**. OrbStack does hand out
a DNS name per service automatically, but it does not imply a default port:

```
http://asset-storybook.atlas-world.svc.k8s.orb.local:6006/   -> 200  (works)
http://asset-storybook.atlas-world.svc.k8s.orb.local/        -> 404  (port 80)
http://asset-storybook.atlas-world.svc.k8s.orb.local/healthz -> 000  (times out)
```

Measured 2026-07-31 against context `orbstack`, namespace `atlas-world`.

So every link that gets shared — in docs, in a session summary, between people — has to
carry `:6006`, `:2567`, `:7351`, and drops silently to a 404 if the port is forgotten.

## Current surface

| service | type | port |
| --- | --- | --- |
| `asset-storybook` | LoadBalancer | 6006 |
| `colyseus-server` | LoadBalancer | 2567 |
| `nakama` | LoadBalancer | 7349 / 7350 / 7351 |
| `cockroachdb` | ClusterIP (headless) | 26257, 8080 |

All three LoadBalancers share external IP `192.168.139.2`.

## Sketch

Add an Ingress to `k8s/local/` routing portless hostnames to the existing services, e.g.
`storybook.atlas.local`, `game.atlas.local`, `nakama.atlas.local`. Needs:

- an ingress controller in the local cluster (OrbStack ships one; confirm before assuming),
- host entries or a wildcard resolver so the names resolve,
- `scripts/deploy-local.sh` to print the hostnames rather than the `localhost:PORT` list
  it prints today.

**Not** a prod change — `deploy-local.sh` already refuses any non-local kubectl context.

## Also worth fixing while in here

The storybook root is a **302**, not the page: `http://<host>:6006/` redirects to
`/tools/asset-storybook/index.html`. The redirect is well-formed (it preserves the port),
but it is the same shape as a bug this repo has already been bitten by — see the
"HTTP status is not proof the page works" lesson. An Ingress rule could serve the app at
the host root instead.
