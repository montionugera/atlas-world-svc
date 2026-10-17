---
title: "Agones gRPC lifecycle sidecar integration and Nakama S2S token authentication"
id: I-129
status: idea
epic: E-001
---

# Agones gRPC lifecycle sidecar integration and Nakama S2S token authentication

## Problem

Integrate the Rust game server into the cloud-native Kubernetes fleet:
1. Agones sidecar gRPC integration via `tonic` (Ready, Health ping loop, Shutdown hooks).
2. Nakama S2S token authentication during WebSocket connection upgrade.
3. Dockerfile packaging for scratch/Alpine container image (< 30 MB).

## Acceptance criteria

- [ ] AC-1: `server-rs` connects to local Agones sidecar mock and marks state `Ready`.
- [ ] AC-2: Health ping loop executes every 2 seconds without failing.
- [ ] AC-3: Connection handshake rejects invalid Nakama tokens (HTTP 401 / close code).
