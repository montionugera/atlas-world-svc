# Goal and Overview

## Goal
Replace RPC polling with WebSocket-based real-time updates using Nakama match handlers. Keep the environment authoritative server-side and maintain smooth client rendering.

## Scope
- Server: Implement match module (CJS) with authoritative tick, opcodes, persistence.
- Client: Use WS transport, handle snapshot/delta, send throttled inputs, remove polling.
- Rollout: Feature flag to toggle RPC/WS, tests, observability, and docs.

## Success Criteria
- Clients receive deltas at target tick rate (20–30 Hz) without RPC polling.
- Player input is validated/throttled; no server crashes.
- All integration tests pass; new WS tests added.
- React client shows stable 60 FPS and update rate reflects server tick.

## Constraints / Risks
- Nakama JS runtime must load a single CommonJS bundle (no ESM/imports).
- Prior runtime crash during match registration; mitigate with minimal module first.
- Network variability; implement reconnect + snapshot resume.

## Milestones
1) Minimal match module registered and startable
2) Broadcast snapshot/delta; client can render basic stream
3) Player input over WS; server applies and validates
4) Remove polling by default; RPC path remains as fallback
5) Observability, tests, and docs complete


