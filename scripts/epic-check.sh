#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[epic-check] Verifying E-004 (One Continuous Open World: AOI, Sleeping Regions, World State Store, Restart Persistence, Border Ghosts, Authority Handoff)"
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$HOME/.local/share/fnm/aliases/default/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/Users/pasitnusso/workspace/repos/atlas-world-svc/server-rs/target-agy}"
cargo test --manifest-path server-rs/Cargo.toml \
  --test sleeping_regions_test \
  --test world_state_store_test \
  --test region_restart_persistence_test \
  --test border_ghosts_test \
  --test authority_handoff_test

echo "[epic-check] Verifying E-007 (Combat Depth: Wind-up & Facing, Parry Cost, Aimed Ranged, Lingering Zones, DoT Statuses, Healing, Boss Scaling, Mob Variety, Companions)"
cargo test --manifest-path server-rs/Cargo.toml \
  --test mob_windup_facing_test \
  --test parry_cost_test \
  --test aimed_ranged_attacks_test \
  --test lingering_area_skills_test \
  --test dot_status_test \
  --test healing_in_fight_test \
  --test boss_tier_scaling_test \
  --test mob_attack_variety_test \
  --test companion_spawn_follow_test \
  --test companion_combat_respawn_test

echo "[epic-check] Verifying E-005 (Reward and Progression Loop: Experience & Levels, Item Catalogue, Loot Drops, Idempotent Grants, Inventory & Equipment, Weapon Switch & Skill Loadout, Death & Fast Travel, Currency & Vendor, Quests at Runtime)"
cargo test --manifest-path server-rs/Cargo.toml \
  --test experience_and_levels_test \
  --test minimal_item_catalogue_test \
  --test loot_drops_and_pickup_test \
  --test idempotent_grants_test \
  --test inventory_and_equipment_test \
  --test weapon_switch_and_skill_loadout_test \
  --test death_bind_and_travel_test \
  --test currency_and_vendor_test \
  --test quests_at_runtime_test

echo "[epic-check] Verifying E-008 (Social Play: Nearby & World Chat + Rate Limiting, Friends List & Presence, Parties & Shared Kill Credit, Find & Join Friends in the World)"
cargo test --manifest-path server-rs/Cargo.toml \
  --test nearby_and_world_chat_test \
  --test friends_list_test \
  --test parties_test \
  --test find_and_join_friends_test

echo "[epic-check] Verifying E-010 & Autonomous Product Owner Studio Pipeline (World History and Concept -> Continent -> District -> Town or Hunting Area)"

python3 scripts/run_world_pipeline.py --fast --auto-tune

rm -rf tests/__pycache__
git checkout -- scripts/__pycache__/ 2>/dev/null || true

echo "[epic-check] PASS — All E-004, E-005, E-007, E-008, E-010, and Product Owner Self-Evaluation assertions verified."
