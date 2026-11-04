#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# A missing or renamed module must fail, rather than silently run zero tests.
run_modules() {
  local module listing
  for module in "$@"; do
    listing="$(cargo test --manifest-path server-rs/Cargo.toml --test it -- "${module}::" --list)"
    if ! grep -q "^${module}::.*: test$" <<<"$listing"; then
      echo "[epic-check] No tests found for ${module}" >&2
      return 1
    fi
    cargo test --manifest-path server-rs/Cargo.toml --test it -- "${module}::"
  done
}

echo "[epic-check] Verifying E-004 (One Continuous Open World: AOI, Sleeping Regions, World State Store, Restart Persistence, Border Ghosts, Authority Handoff)"
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$HOME/.local/share/fnm/aliases/default/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/Users/pasitnusso/workspace/repos/atlas-world-svc/server-rs/target-agy}"
run_modules \
  sleeping_regions_test \
  world_state_store_test \
  region_restart_persistence_test \
  border_ghosts_test \
  authority_handoff_test

echo "[epic-check] Verifying E-007 (Combat Depth: Wind-up & Facing, Parry Cost, Aimed Ranged, Lingering Zones, DoT Statuses, Healing, Boss Scaling, Mob Variety, Companions)"
run_modules \
  mob_windup_facing_test \
  parry_cost_test \
  aimed_ranged_attacks_test \
  lingering_area_skills_test \
  dot_status_test \
  healing_in_fight_test \
  boss_tier_scaling_test \
  mob_attack_variety_test \
  companion_spawn_follow_test \
  companion_combat_respawn_test

echo "[epic-check] Verifying E-005 (Reward and Progression Loop: Experience & Levels, Item Catalogue, Loot Drops, Idempotent Grants, Inventory & Equipment, Weapon Switch & Skill Loadout, Death & Fast Travel, Currency & Vendor, Quests at Runtime)"
run_modules \
  experience_and_levels_test \
  minimal_item_catalogue_test \
  loot_drops_and_pickup_test \
  idempotent_grants_test \
  inventory_and_equipment_test \
  weapon_switch_and_skill_loadout_test \
  death_bind_and_travel_test \
  currency_and_vendor_test \
  quests_at_runtime_test

echo "[epic-check] Verifying E-008 (Social Play: Nearby & World Chat + Rate Limiting, Friends List & Presence, Parties & Shared Kill Credit, Find & Join Friends in the World)"
run_modules \
  nearby_and_world_chat_test \
  friends_list_test \
  parties_test \
  find_and_join_friends_test

echo "[epic-check] Verifying E-010 & Autonomous Product Owner Studio Pipeline (World History and Concept -> Continent -> District -> Town or Hunting Area)"

python3 scripts/run_world_pipeline.py --fast --auto-tune

rm -rf tests/__pycache__
git checkout -- scripts/__pycache__/ 2>/dev/null || true

echo "[epic-check] PASS — All E-004, E-005, E-007, E-008, E-010, and Product Owner Self-Evaluation assertions verified."
