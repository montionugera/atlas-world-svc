---
title: "5"
id: F-059
status: refined
epic: E-001
from_idea: I-130
---

# Platform decorator support in node-server-decorator, full client cutover, and release deployment

## Problem

Address the platform requirements and complete the client cutover:
1. Port or integrate required platform utility functions / decorators in `node-server-decorator` upstream if needed for metrics/event tracking.
2. Connect `game-client` and `react-client` to `server-rs` endpoints.
3. Validate live multiplayer playtest on local Kubernetes cluster (`k8s/local`).
4. Decommission `colyseus-server`.

## Acceptance criteria

- [ ] AC-1: Platform utilities/decorators validated against `node-server-decorator`.
- [ ] AC-2: `game-client` joins `server-rs` match pod, renders world, moves player, and receives entity sync.
- [ ] AC-3: Full local cluster rollout (`kubectl rollout status`) passes with clean pod status.
- [ ] AC-4: `colyseus-server` is retired cleanly.
