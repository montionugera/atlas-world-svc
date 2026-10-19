# F-109: Authority handoff — Implementation Plan

## Tasks
1. **Task 1: Create `server-rs/src/spatial/handoff.rs` (`PlayerTransferState`, `HandoffToken`, `AuthorityHandoffCoordinator`)**
   - Define `PlayerTransferState` capturing a player's `session_id`, `source_region_id`, `target_region_id`, `border`, local position `(x, y)` transformed into target region coordinates, velocity `(vx, vy)`, `health`, `max_health`, `cooldowns`, `status_effects`, and `loadout`.
   - Define `HandoffToken` (`token_id`, `session_id`, `from_region`, `to_region`, `issued_at_tick`, `transfer_state`) and `AuthorityHandoffCoordinator` enforcing hysteresis (`HANDOFF_HYSTERESIS_UNITS = 32.0`) and single-tick atomic handoff across `rooms: &mut HashMap<String, AtlasSimulation>`.
   - When a player crosses a connected cardinal border (`x <= 0.0`, `x >= W`, `y <= 0.0`, or `y >= H` with outward velocity or border hysteresis):
     1. Atomically despawn the player from `source_sim` and spawn/restore their exact state (position wrapped + `HANDOFF_HYSTERESIS_UNITS` into `target_sim`, velocity, health, cooldowns, status effects, loadout) into `target_sim` within the same tick (`<= 1` tick / `50 ms`), waking `target_sim` if it was sleeping (`target_sim.wake(now_ms)`).
     2. Reassign the player's WebSocket room routing on `WsServer` (`reassign_session_room(session_id, to_region)`) so subsequent inputs and AOI snapshots seamlessly route to `to_region` without dropping the WebSocket connection.
2. **Task 2: Integrate `AuthorityHandoffCoordinator` with `AtlasSimulation`, `WsServer`, and `main.rs`**
   - Add `extract_player_transfer_state` and `accept_player_transfer_state` on `AtlasSimulation` (`server-rs/src/simulation.rs`).
   - Add `reassign_session_room` on `WsServer` (`server-rs/src/net/ws.rs`).
   - Wire `AuthorityHandoffCoordinator` into `server-rs/src/main.rs` and `scripts/epic-check.sh` (`E-004` verification).
3. **Task 3: Integration test (`server-rs/tests/authority_handoff_test.rs`)**
   - Verify atomic single-tick player transfer across `millcross-ford` -> `ashvale-front`, preserving health, velocity, cooldowns, and loadout, with 0 duplicate or missing ticks, waking a sleeping target region, and seamless `WsServer` room reassignment.
