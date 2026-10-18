---
id: I-169
title: "Validate target intents — reject a target_id or target position the player cannot legitimately use, each with a test that fails today"
status: idea
created: 2026-10-16
epic: E-006
---

# Validate target intents — reject a target_id or target position the player cannot legitimately use, each with a test that fails today

## Problem
Currently `AtlasSimulation::apply_player_input` in `server-rs/src/simulation.rs` blindly accepts whatever `target_id` and `(target_x, target_y)` a client sends:
1. If a client sends a `target_id` referencing a non-existent entity, a dead entity (`!health.is_alive`), a friendly player (`With<PlayerTag>` instead of a hostile mob `With<MobTag>`), or an entity beyond `MAX_TARGET_INTENT_RANGE`, `apply_player_input` still writes `input_state.target_id = input.target_id()` and resolves `target_entity` without checking liveness, hostility (`MobTag`), or range.
2. If a client sends `(target_x, target_y)` with non-finite floats (`NaN`, `Infinity`) or coordinates outside the arena bounds (`[0.0, arena_width] x [0.0, arena_height]`) or non-finite movement vectors (`move_x`, `move_y`), `apply_player_input` stores them directly on `PlayerInputState`.

## Solution
1. **Validate `target_id` in `AtlasSimulation::apply_player_input`**:
   - Define `pub const MAX_TARGET_INTENT_RANGE: f32 = 500.0;`.
   - Resolve `input.target_id()` against entities in `self.world` that have `(&EntityId, &Position, &Health, Has<MobTag>)`:
     - Reject (set `resolved_target_entity = None` and `validated_target_id = 0`) if:
       - No entity matches `fnv1a_32(&eid.0) == input.target_id()`, OR
       - The entity is not a hostile mob (`!is_mob`, e.g. self or another player), OR
       - The entity is dead (`!health.is_alive`), OR
       - The Euclidean distance from the player's current position (or spawn position on first join) to the target's position exceeds `MAX_TARGET_INTENT_RANGE`.
2. **Validate `(target_x, target_y)` and `(move_x, move_y)` in `AtlasSimulation::apply_player_input`**:
   - Sanitize non-finite `move_x` / `move_y` (`!v.is_finite()`) to `0.0`.
   - Reject `(target_x, target_y)` (`target_pos = None`, leaving previous valid `target_pos` untouched or `None` on invalid intent) when:
     - `!target_x.is_finite() || !target_y.is_finite()`, OR
     - `target_x < 0.0 || target_x > self.arena_width || target_y < 0.0 || target_y > self.arena_height`, OR
     - Distance from the player's position to `(target_x, target_y)` exceeds `MAX_TARGET_INTENT_RANGE`.

## Acceptance Criteria
- [ ] Unit/integration tests verify that targeting a non-existent `target_id`, targeting self/another player, targeting a dead mob, or targeting a mob beyond `MAX_TARGET_INTENT_RANGE` is rejected (`input_state.target_id == 0` and `input_state.target_entity.is_none()`).
- [ ] Unit/integration tests verify that `NaN`/`Infinity`, out-of-bounds `(target_x, target_y)`, or `(target_x, target_y)` beyond `MAX_TARGET_INTENT_RANGE` is rejected (`input_state.target_pos` is not updated to the illegitimate position).
- [ ] Valid in-range living mob `target_id` and valid in-bounds, in-range `(target_x, target_y)` continue to work for combat and skill execution.
