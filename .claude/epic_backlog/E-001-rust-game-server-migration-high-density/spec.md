---
title: "Rust game server migration - high-density ECS and Rapier physics core"
id: E-001
status: epic
---

# Rust game server migration - high-density ECS and Rapier physics core

## Outcome

The TypeScript/Colyseus prototype game server is replaced by a production-grade, authoritative Rust game server (`server-rs`). The new server utilizes an archetypal Entity Component System (`bevy_ecs`) and `rapier2d` SIMD physics, running with zero garbage collection pauses and a sub-millisecond tick runtime (< 1.0 ms @ 20 Hz) verified against a golden deterministic simulation trace from the TypeScript baseline. It replicates game state to Web and desktop clients via FlatBuffers binary delta streams over WebSockets, connects natively to the local Agones sidecar via gRPC (`tonic`) for Kubernetes pod management, authenticates players against Nakama, and integrates required platform decorators from `node-server-decorator`.

## Slices

1. TypeScript baseline benchmark and golden deterministic trace with I-124 spatial grid and SimClock
2. Headless server-rs ECS simulation core with Rapier2D physics verified against golden trace
3. FlatBuffers binary delta state replication protocol and TypeScript client decoders
4. Agones gRPC lifecycle sidecar integration and Nakama S2S token authentication
5. Platform decorator support in node-server-decorator, full client cutover, and release deployment
