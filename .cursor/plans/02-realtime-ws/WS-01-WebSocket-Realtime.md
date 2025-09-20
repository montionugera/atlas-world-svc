# WS-01 WebSocket Realtime

## Epic plan
Implement WebSocket-based realtime with Nakama match handlers, migrating away from RPC polling.

## Stories
- [1] Server: minimal match module registers without crash ⏳
- [2] Server: authoritative tick loop with opcodes (snapshot/delta) ⏳
- [3] Client: open WS, join/leave, handle snapshot/delta ⏳
- [4] Client: send PlayerInput (10–20 Hz), throttle, recovery ⏳
- [5] Server: validation, heartbeats, persistence ⏳
- [6] Tests: integration WS E2E, perf checks ⏳
- [7] Rollout: feature flag USE_WS, docs, metrics ⏳

## Tasks
- Server
  - Create CommonJS match module with `matchInit`, `matchJoin`, `matchLoop`, `matchLeave`, `matchTerminate`
  - Define opcodes: 1 JoinAck, 10 Snapshot, 11 Delta, 20 PlayerInput, 90 Error
  - Port map simulation to matchLoop (fixed rate 20–30 Hz)
  - Broadcast delta each tick; periodic snapshot; persistence on interval
  - Input validation, anti-spam

- Client
  - Add WS path in hook: connect, join map stream, onmatchdata handler
  - Maintain buffer/interpolation against server tick
  - Throttle input and send PlayerInput reliably; reconnect with resume

- Observability & Tests
  - Metrics: tick duration, msgs/sec, connected players
  - Integration: join, receive snapshot, n deltas, send input, verify state
  - Keep RPC as fallback behind flag; default to WS after stabilization

## Status
All stories pending.
