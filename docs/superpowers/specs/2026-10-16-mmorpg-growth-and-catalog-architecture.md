# Master MMORPG Growth, Mini-Systems & 3-Tier Data Architecture

**Date:** 2026-10-16 · **Status:** Approved & Phase 1 Implemented

---

## 1. Executive Summary

To build a full-scale **MMORPG + Level/Job Growth** world without losing observability or suffering data drift across tools, **Atlas World (`atlas-world-svc`)** separates data into **Three Purpose-Built Storage Tiers**:

| Tier | Tool / Engine | What Lives Here | Why |
| :--- | :--- | :--- | :--- |
| **Tier 1: Macro Strategy & Lore Canon** | `agentic-vault` + `content/story/canon.md` | Cross-repo Epics (`PROJ-atlas-world`, `PROJ-asset-studio`), 5-Act / 10-Region Lore Bible, System Specs | Human + AI friendly prose, Obsidian graph, OCC locks; never bloated with thousands of stat rows. |
| **Tier 2: Static Game Design Catalog (SSOT)** | `contracts/content/*.json` + `build/catalog.sqlite` | Jobs, Skills, Items, Equipment, Cards, Mobs, Drops, Quests (Main/Side/Job/Bounty), Adventure Handbook, Castles (GvG), Maps | **NoSQL document flexibility** in Git + **Zod compile-time validation** + **1-second SQLite relational & balance queries** (`scripts/build_catalog_db.py`). |
| **Tier 3: Live Runtime Player & Guild State** | `Nakama` (Postgres / CockroachDB `JSONB`) + `server-rs` (20Hz ECS) | Player Base/Job Lv, Allocated Stats, Inventory, Equipped +Refine/Cards, Active Quests, Handbook Unlocks, GvG Castle Ownership | High-concurrency NoSQL document collections with Optimistic Concurrency Control (`version`) and authoritative S2S RPCs. |

---

## 2. The 8 Core MMORPG Domains & Mini-Systems

### 2.1 Lore Building & World Canon
- **Source of Truth**: `content/story/canon.md` and `content/schemas/*.schema.json`.
- **Gate**: `node scripts/check_content.mjs` verifies that every faction, act, arc, character, and region resolves cleanly.

### 2.2 Town & Castle Concept
- **Towns**: Defined in `content/schemas/town-plan.schema.json` and 3D map files (`content/maps/*.json`).
- **Guild Castles (War of Emperium)**: Defined in `contracts/content/castles.json` (`CastleDef`), specifying:
  - Hub Town & Siege Map ID (`hubTownId`, `siegeMapId`)
  - Outer/Inner Gate Barricades & Guardian Stones (`fortifications`)
  - Emperium entity rules (`hp`, `element: "Holy"`, `onlyNormalAttackDamage: true`)
  - Guild Dungeon & Town Tax rewards (`ownerRewards`)

### 2.3 Gameplay & Dual-Track Growth Mechanic (Base Lv + Job Lv)
- **Base Level (`1–99`)**: Grants Primary Stat Points (`STR`, `AGI`, `VIT`, `INT`, `DEX`) following the `+4.5%/level` Combat Score curve (`docs/superpowers/specs/2026-07-28-combat-balance-sheet.md`).
- **Job Level (`1–10` Novice → `1–40` 1st Job → `1–50` 2nd Job)**: Grants Skill Points and Job Stat Bonuses (`jobBonusAtMax`).

### 2.4 Level & Jobs Balance (`contracts/content/jobs.json` & `elements.json`)
- **Job Hierarchy**:
  - `novice` (Tier 0) → `swordman` / `mage` / `archer` (Tier 1) → `knight` / `wizard` (Tier 2).
- **Counter Matrix (`contracts/content/elements.json`)**:
  - **10 Elements**: `Neutral`, `Water`, `Earth`, `Fire`, `Wind`, `Poison`, `Holy`, `Shadow`, `Ghost`, `Undead`.
  - **Weapon vs. Mob Size Table**: Daggers (`100% Small / 75% Medium / 50% Large`), Swords (`75% / 100% / 75%`), Polearms/Scythes (`75% / 75% / 100%`), Magic (`100%` all sizes).

### 2.5 Map Detail & 3D Walkability (`content/maps/*.json`)
- **Single-Source Terrain**: Shared heightfield + terraces (`<= 35°` walkable grass, `> 35°` sheer cliff rock barrier) + `WalkableSlabs` for multi-floor Watchtowers, Caves, and Castle Siege ramps.
- **Verification**: `ATLAS_VERIFY_VERTICAL_SLICE=1` headless Godot probe.

### 2.6 Mob Detail & Ecology (`contracts/content/mobs.json`)
- Every mob defines its `level`, `rank` (`E..SSS`), `element`, `race`, `size`, `isMvp`, `hp`, `pAtk`, `pDef`, `baseExp`, `jobExp`, `aggroRangeM`, `leashRangeM`, `spawnZones`, `drops` (in basis points `1..10000`), `cardId`, and `assetStudioKey`.

### 2.7 Equipment, Monster Cards & Adventure Handbook
- **Items & Weapons (`contracts/content/items.json`)**: Weapons, armors, accessories, consumables, and crafting materials.
- **Monster Cards (`contracts/content/cards.json`)**: Socketable into `weapon`, `armor`, `accessory`, or `headgear` slots; also grant permanent passive bonuses when deposited into the **Adventure Handbook**.
- **Adventure Handbook (`contracts/content/handbook.json`)**: Tracks kill-count milestones (`10 / 100 / 500`), scenic vista discoveries, and card deposits—rewarding account-wide passive stats and unlocking mob HP/drop inspection.

### 2.8 Quest Taxonomy (`contracts/content/quest_board.json`)
Unifies all 6 quest loops under one schema (`questBoardEntrySchema`):
1. `main_story` — Act/Region narrative progression
2. `job_change` — Class advancement trials (`jq_swordman_trial`, `jq_mage_academy`, `jq_knight_chivalry`, etc.)
3. `platinum_skill` — Special utility skill unlocks
4. `side_story` — Regional NPC stories & town reputation
5. `daily_bounty` — Repeatable monster hunt board commissions driving party play
6. `guild_commission` — Cooperative guild siege & supply missions

---

## 3. Observability & CLI Commands

```bash
# 1. Validate all TypeScript/Zod schemas & cross-catalog foreign keys
pnpm --dir contracts test

# 2. Rebuild build/catalog.sqlite + build/catalog_summary.json
python3 scripts/build_catalog_db.py

# 3. Query Job Progression, Mob Economy, or Asset Studio Sync Keys via SQLite
sqlite3 -header -column build/catalog.sqlite "SELECT * FROM v_job_progression;"
sqlite3 -header -column build/catalog.sqlite "SELECT * FROM v_mob_economy;"
sqlite3 -header -column build/catalog.sqlite "SELECT * FROM v_asset_studio_entries;"
```
