# Game Wiki System Inventory & Architecture Specification

**Document ID:** `docs/research/game-wiki-inventory-2026-10-30.md`  
**Date:** 2026-10-30  
**Status:** Canonical Research Inventory  
**Target:** Atlas World Player-Facing Game Wiki & Review Surface  
**Owner Mandate:** "Every game system/feature must have a user-friendly, rich wiki page explaining it to players (like a spec, but friendly)."

---

## Section A: Implemented Game Systems Inventory

Every entry below represents a functioning, server-authoritative system in `server-rs/src/**` with verified file and line anchors, active content catalogs, and current player visibility.

| System Name (Player Words) | What It Does in 1 Line | Implementation Evidence | Data Source | Existing Builder Docs | Player-Visible Today? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Races & Core Attributes** | Defines the 6 playable races, base stats (STR, AGI, VIT, INT, DEX, LUK), racial traits, and server-authoritative derived combat stats. | `server-rs/src/content/races.rs:7`<br>`server-rs/src/content/races.rs:219`<br>`server-rs/src/content/stats.rs:52` | `content/studio/world_history_and_concept.json`<br>`contracts/src/meta/derivedStats.ts` | `docs/worldbuilding/A1-cosmology.md`<br>`docs/meta-systems.spec.md` | **Yes** — Character creation, starter towns, and Web Catalog tab `races`. |
| **Attack Speed (ASPD) & Cast Reduction** | Calculates physical hit frequency clamped to 5.0 hits/sec via AGI/DEX and spell cast time reduction up to 80% via DEX/INT. | `server-rs/src/content/stats.rs:92`<br>`server-rs/src/content/stats.rs:93` | `contracts/src/meta/derivedStats.ts`<br>`contracts/content/jobs.json` | `docs/superpowers/plans/2026-07-30-combat-model-split.md`<br>`.claude/refined_backlog/_archive/1.11/F-061-elemental-combat-system-skill-execution/spec.md` | **Yes** — Combat Lab tab `combat-lab` and character stats panel. |
| **Damage Types & Elemental Affinities** | Resolves physical and magical damage through defense formulas (max 80% armor reduction) and a 7-element counter cycle (Water, Fire, Earth, Wind, Holy, Void, Neutral). | `server-rs/src/combat/elements.rs:5`<br>`server-rs/src/combat/elements.rs:55`<br>`server-rs/src/combat/damage.rs:5`<br>`server-rs/src/combat/damage.rs:43` | `contracts/content/elements.json`<br>`contracts/content/skills.json` | `docs/superpowers/plans/2026-07-31-battle-attack-damagetype.md`<br>`.claude/refined_backlog/_archive/1.11/F-061-elemental-combat-system-skill-execution/spec.md` | **Yes** — Combat Lab tab `combat-lab` and Property & Size Chart tab `elements`. |
| **High-Stakes +20 Enchanting Forge** | Authoritative item enhancement from +0 to +20 with safe tier +4, steep success decay down to 4% at +19, failure crystallization, and visual glows. | `server-rs/src/content/enchantment.rs:5`<br>`server-rs/src/content/enchantment.rs:88`<br>`server-rs/src/content/enchantment.rs:112` | `contracts/content/items.json`<br>`content/season-1-budget.json` | `docs/superpowers/plans/2026-07-18-asset-sourcing-catalog.md`<br>`.claude/refined_backlog/_archive/1.10/F-055-1/spec.md` | **Yes** — High-Stakes +20 Forge tab `enchant` in Web Catalog. |
| **Card Sockets & Special Abilities** | Allows socketed equipment to receive monster cards and special ability imbues (Focus, Haste, Guidance) altering stats and damage affinities. | `server-rs/src/content/enchantment.rs:208`<br>`server-rs/src/content/enchantment.rs:238`<br>`server-rs/src/content/enchantment.rs:39` | `contracts/content/cards.json`<br>`contracts/content/items.json` | `docs/superpowers/plans/2026-07-18-asset-sourcing-catalog.md` | **Yes** — Item & Card DB tab `gear` with slotted socket indicators. |
| **Buffs, Auras & Song/Dance Slots** | Enforces a dual-capacity buff system supporting 24 standard buff slots and 12 separate song/dance slots, alongside spatial party aura emittance. | `server-rs/src/combat/buffs.rs:5`<br>`server-rs/src/combat/buffs.rs:7`<br>`server-rs/src/combat/buffs.rs:11`<br>`server-rs/src/combat/buffs.rs:115`<br>`server-rs/src/combat/buffs.rs:194` | `contracts/content/skills.json`<br>`contracts/content/jobs.json` | `docs/research/aura-spatial-bench-2026-10-30.md`<br>`docs/game-server.spec.md` | **Yes** — Status buff tray on game HUD and Combat Lab simulation. |
| **Cast Interruption & Focus** | Cancels in-flight spell or skill casting when taking unmitigated damage unless granted an uninterruptible buff or poise status. | `server-rs/src/ecs/components.rs:804`<br>`server-rs/src/systems/skill_execution.rs:53`<br>`server-rs/src/systems/combat.rs:240` | `contracts/content/skills.json` | `docs/superpowers/plans/2026-07-30-combat-model-split.md` | **Yes** — Spell cast bar breaks on incoming hit in live runtime and client. |
| **Boss Phases, Enrage & MVP Distribution** | Orchestrates multi-phase boss mechanics (Phase 1, Phase 2 at <=50% HP, hard timer enrage), awarding MVP loot by damage, tanking, and hits. | `server-rs/src/fleet/dungeons.rs:18`<br>`server-rs/src/fleet/dungeons.rs:71`<br>`server-rs/src/fleet/dungeons.rs:149`<br>`server-rs/src/fleet/dungeons.rs:739`<br>`server-rs/src/fleet/dungeons.rs:749` | `content/dungeons/_compiled_catalog.json`<br>`contracts/content/mobs.json` | `docs/superpowers/plans/2026-07-31-f023-boss-threat-aggro.md`<br>`docs/superpowers/plans/2026-08-04-F-030-thornveil-apex-boss.md` | **Yes** — Boss HP bars, phase transitions, and MVP reward distribution banner. |
| **Dungeons, Spires & Gateway Egress** | Manages 60 authoritatively compiled multi-floor dungeons with portal coordinates, level gates, and egress locked until the boss is slain. | `server-rs/src/content/dungeons.rs:11`<br>`server-rs/src/content/dungeons.rs:46`<br>`server-rs/src/fleet/dungeons.rs:650` | `content/dungeons/_compiled_catalog.json`<br>`content/dungeons/*.json` | `docs/superpowers/plans/2026-07-28-dungeon-spires.md`<br>`docs/game-server.spec.md` | **Yes** — 60-Dungeon Spires tab `dungeons` and world portal interactables. |
| **Parties, Friends & Social Chat** | Provides party formation, member vitals sync, shared kill XP, cross-region friend locator/joins, and multi-channel rate-limited chat. | `server-rs/src/systems/social.rs:64`<br>`server-rs/src/systems/social.rs:127`<br>`server-rs/src/systems/social.rs:246`<br>`server-rs/src/systems/social.rs:281`<br>`server-rs/src/systems/social.rs:386`<br>`server-rs/src/systems/social.rs:524` | `contracts/src/protocol/index.ts`<br>`contracts/content/handbook.json` | `docs/networking.spec.md`<br>`docs/event-flow.spec.md` | **Yes** — In-game chat window (Nearby, Party, World, System) and party HUD. |
| **Currency & NPC Merchant Vendors** | Tracks player gold wallet balances and processes authoritative buy/sell transactions with inventory capacity and price ledger validation. | `server-rs/src/ecs/components.rs:1534`<br>`server-rs/src/content/item_catalog.rs:49`<br>`server-rs/src/systems/progression.rs:486`<br>`server-rs/src/systems/progression.rs:525` | `contracts/content/items.json`<br>`contracts/src/meta/mmorpgCatalogs.ts` | `docs/meta-systems.spec.md`<br>`.claude/refined_backlog/_archive/1.10/F-055-1/spec.md` | **Yes** — Shop dialogues and inventory gold display in client. |
| **Loot Drops & World Pickup** | Spawns physical ground loot containers from defeated mobs by tier tables and automatically awards items to living players within 25 units. | `server-rs/src/content/item_catalog.rs:32`<br>`server-rs/src/content/item_catalog.rs:207`<br>`server-rs/src/ecs/components.rs:1540`<br>`server-rs/src/systems/progression.rs:12`<br>`server-rs/src/systems/progression.rs:130`<br>`server-rs/src/systems/progression.rs:175` | `contracts/content/items.json`<br>`contracts/content/mobs.json` | `docs/meta-systems.spec.md`<br>`docs/game-server.spec.md` | **Yes** — Ground item drop containers and auto-loot notifications. |
| **Story Quests & Narrative Progression** | Governs the 28 authored story quests, step objectives, dialogue triggers, prerequisites, completion tracking, and reward claims. | `server-rs/src/systems/progression.rs:554`<br>`server-rs/src/systems/progression.rs:605`<br>`server-rs/src/systems/progression.rs:650`<br>`server-rs/src/systems/progression.rs:711` | `content/story/quests.json`<br>`content/story/dialogue.json`<br>`contracts/content/quests.json` | `docs/superpowers/plans/2026-07-22-epic-story-pipeline.md`<br>`docs/superpowers/plans/2026-07-23-grand-epic-undertow.md` | **Yes** — Quest Database tab `quests` and quest tracker HUD. |
| **Experience, Leveling & Stat Scaling** | Calculates level progression requirements (100 * level), tracks XP gains, and scales base HP (+20/level) and ATK (+3/level) upon leveling up. | `server-rs/src/ecs/components.rs:1350`<br>`server-rs/src/ecs/components.rs:1356`<br>`server-rs/src/systems/progression.rs:8`<br>`server-rs/src/systems/progression.rs:10`<br>`server-rs/src/systems/progression.rs:31` | `contracts/content/jobs.json`<br>`contracts/src/meta/derivedStats.ts` | `docs/superpowers/plans/2026-07-30-combat-model-split.md`<br>`docs/meta-systems.spec.md` | **Yes** — Experience bar, level indicator, and stat progression screens. |
| **Death, Bind Points & Fast Travel** | Deducts a 10% level XP penalty on death (cannot de-level), respawns at town bind points, and enables instant travel to discovered waypoints. | `server-rs/src/ecs/components.rs:1516`<br>`server-rs/src/systems/progression.rs:14`<br>`server-rs/src/systems/progression.rs:381`<br>`server-rs/src/systems/progression.rs:424`<br>`server-rs/src/systems/progression.rs:455` | `content/zones/*.json`<br>`content/towns/*.json`<br>`content/maps/*.json` | `docs/research/2026-08-01-dossier-death-relics-forbidden.md`<br>`docs/game-server.spec.md` | **Yes** — Respawn popup, town bind shrines, and world map waypoint fast travel. |
| **Pet & Companion Followers** | Spawns persistent AI companions that follow owners within tether distance, auto-aggro enemy threats, fight in combat, and respawn after 30s. | `server-rs/src/ecs/components.rs:249`<br>`server-rs/src/systems/companion.rs:9`<br>`server-rs/src/systems/companion.rs:42`<br>`server-rs/src/systems/companion.rs:121`<br>`server-rs/src/systems/companion.rs:242` | `content/characters/player-expedition.md`<br>`contracts/content/handbook.json` | `docs/companion.spec.md`<br>`docs/ai.spec.md` | **Yes** — Companion models following players in client and companion health HUD. |
| **Bestiary & Monster Ecosystem** | Implements 116 fauna across 5 tiers (Verge, Route, Interior, Heart, Boss) with behavior trees (Aggro, Windup, Patrol, Leash) and stat scaling. | `server-rs/src/content/bestiary.rs:19`<br>`server-rs/src/content/bestiary.rs:111`<br>`server-rs/src/content/bestiary.rs:184`<br>`server-rs/src/systems/mob_ai.rs:124`<br>`server-rs/src/systems/mob_lifecycle.rs:104` | `content/bestiary/bestiary.json`<br>`content/generated/mob-types.json`<br>`content/generated/spawn-areas.json` | `docs/superpowers/plans/2026-07-22-mob-types-gate.md`<br>`docs/mob-movement.spec.md`<br>`.claude/refined_backlog/_archive/1.11/F-062-bestiary-catalog-ingestion-mob-ai-states/spec.md` | **Yes** — Monster Detail tab `mobs`, World Bestiary tab `bestiary`, and open world spawns. |
| **World Map, Continents & Starter Towns** | Structures the multi-continent world (Hearthbloom Basin, Clockwork Steppe, Shattered Halo), starter towns, heightfields, and zone portals. | `server-rs/src/content/map.rs:321`<br>`server-rs/src/content/world_regions.rs:28`<br>`server-rs/src/content/world_model.rs:35`<br>`server-rs/src/systems/portal.rs:9` | `content/studio/continents/*.json`<br>`content/studio/districts/...`<br>`content/maps/*.json`<br>`content/zones/*.json`<br>`content/towns/*.json` | `docs/worldbuilding/A0-current-world.md`<br>`docs/terrain.spec.md`<br>`docs/superpowers/plans/2026-10-25-epic-multiscale-composable-map-pipeline-plan.md` | **Yes** — Interactive World Map tab `world`, Connected Map tab `maps`, and live world streaming. |
| **Inventory & Equipment Slots** | Handles stacked item inventory and 3 dedicated gear slots (weapon, armor, accessory) with dynamic recalculation of offensive and defensive stats. | `server-rs/src/ecs/components.rs:1413`<br>`server-rs/src/ecs/components.rs:1470`<br>`server-rs/src/systems/progression.rs:238`<br>`server-rs/src/systems/progression.rs:280` | `contracts/content/items.json` | `docs/meta-systems.spec.md` | **Yes** — Player inventory window and paperdoll equipment UI in client. |
| **Weapon Swap & Hotbar Skill Loadout** | Enables dynamic hot-swapping of active weapons to change attack properties, coupled with player-configurable 4-slot skill hotbars. | `server-rs/src/ecs/components.rs:1478`<br>`server-rs/src/systems/progression.rs:355`<br>`server-rs/src/systems/progression.rs:388` | `contracts/content/skills.json`<br>`contracts/content/jobs.json` | `docs/superpowers/plans/2026-07-30-combat-model-split.md` | **Yes** — Hotbar slots 1–4 and weapon swap toggle on HUD. |
| **Directional Projectiles & Ranged Aiming** | Simulates aimed ballistic projectiles with collision detection, travel velocities, max ranges, and targeted target-point impact damage. | `server-rs/src/ecs/components.rs:840`<br>`server-rs/src/systems/projectile.rs:12`<br>`server-rs/src/systems/projectile.rs:33`<br>`server-rs/src/systems/skill_execution.rs:149` | `contracts/content/skills.json` | `docs/superpowers/plans/2026-07-30-combat-model-split.md` | **Yes** — Arrow projectiles, spell missiles, and ranged attacks in client. |
| **Ground-Targeted AoE & Lingering Fields** | Deploys stationary ground spell areas (blizzards, fire zones) pulsing damage and status effects at fixed tick intervals over their duration. | `server-rs/src/ecs/components.rs:885`<br>`server-rs/src/systems/projectile.rs:188` | `contracts/content/skills.json` | `docs/superpowers/plans/2026-07-30-combat-model-split.md` | **Yes** — Ground targeting reticles and persistent spell field effects. |
| **Status Conditions & Damage-Over-Time (DoT)** | Evaluates duration-based ailments (Poison, Burn, Freeze, Stun, Silence), applying periodic damage ticks and movement/action lockouts. | `server-rs/src/ecs/components.rs:563`<br>`server-rs/src/ecs/components.rs:569`<br>`server-rs/src/systems/combat.rs:275` | `contracts/content/skills.json`<br>`contracts/content/elements.json` | `docs/superpowers/plans/2026-07-31-battle-attack-damagetype.md` | **Yes** — Status ailment icons on health plates and floating combat damage ticks. |
| **Active Parry & Stamina Defense** | Allows timed defensive blocks mitigating incoming physical damage at the cost of stamina/posture, preventing hit stun when successful. | `server-rs/src/ecs/components.rs:1140`<br>`server-rs/src/systems/combat.rs:180` | `contracts/content/skills.json` | `docs/superpowers/plans/2026-07-30-combat-model-split.md` | **Yes** — Guard/shield stance button and parry feedback sound/FX. |
| **Terrain Elevation & Surface Speed Modifiers** | Modifies character movement velocity by surface type (Road: 1.15x, Grass: 1.0x, Mud: 0.75x, Water: 0.5x) and blocks pathing at cliffs. | `server-rs/src/content/map.rs:77`<br>`server-rs/src/content/map.rs:98`<br>`server-rs/src/content/map.rs:154`<br>`server-rs/src/systems/player_input.rs:81`<br>`server-rs/src/systems/mob_ai.rs:193` | `content/maps/*.json`<br>`content/studio/map_feature_layers.json` | `docs/terrain.spec.md`<br>`docs/mob-movement.spec.md` | **Yes** — Speed changes on roads/swamps and physical cliff collision in client. |
| **Spatial Border Ghosting & Partition Handoff** | Replicates proxy entities across partition seams and orchestrates zero-hitch entity authority handoffs as players traverse regions. | `server-rs/src/spatial/border_ghosts.rs:25`<br>`server-rs/src/spatial/handoff.rs:18`<br>`server-rs/src/spatial/aoi.rs:30` | `content/studio/continents/*.json`<br>`server-rs/src/content/world_regions.rs` | `docs/superpowers/plans/2026-08-02-i058-stage1-aoi.md`<br>`docs/networking.spec.md` | **Yes** — Seamless open-world transitions without loading screens. |
| **Idempotent Rewards Ledger** | Prevents duplicate duplication exploits by recording unique grant keys (`pickup:<id>`, `quest:<id>`) in an authoritative ledger before payouts. | `server-rs/src/systems/progression.rs:51`<br>`server-rs/src/systems/progression.rs:216`<br>`server-rs/src/systems/progression.rs:711` | `server-rs/src/storage/nakama.rs`<br>`contracts/src/meta/schemas.ts` | `docs/meta-systems.spec.md`<br>`docs/event-flow.spec.md` | **No** — Server backend anti-cheat invariant ensuring economic integrity. |

---

## Section B: Existing Review Surface & Parity-Gate Architecture

### 1. How Tabs Are Served Today
The Atlas World observatory interface (`scripts/catalog_explorer_web.py`, running on port 8788) serves two distinct classes of views:

1. **Inline Re-rendered Tabs:**  
   Driven by `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js`, the core `render()` routine rebuilds `#mainContent` with `innerHTML` whenever tab or route state updates. This powers lightweight catalog tabs (`mobs`, `bestiary`, `gear`, `jobs`, `races`, `dungeons`, `enchant`, `quests`, `elements`, `siege`, `sql`, `sim`, `docs`).
2. **Mounted Persistent Panels (`panel: true`):**  
   Heavyweight interfaces that maintain client-side state (such as 3D canvas contexts, decoded WebAudio buffers, zoom/pan transforms, and live service WebSocket feeds) are marked with `panel: true` in `NAV_GROUPS`. Mounted panels reside inside `#panelHost`—a DOM sibling to `#mainContent` that `render()` never clears.  
   - The contract in `atelier/atlas-world-panels/js/panels/registry.mjs` defines:
     ```javascript
     register(id, {
       mount(el, params), // Called once on first activation
       show(params),      // Called on tab switch / parameter change
       hide(),            // Called when navigating away
       count()            // Returns the numerical badge for the sidebar
     });
     ```
   - Current registered panel tabs include: `map-sheets`, `map-builder`, `assets`, `audio`, `art`, `coverage`, `forge`, `combat-lab`, plus sub-view claims for `story` and `review`.
   - `atelier/atlas-world-panels/index.html` provides the standalone wrapper that forwards directly to `/?tab=assets`.

### 2. Architecture for Adding a Dedicated `wiki` Tab
To integrate the Player-Facing Game Wiki seamlessly into the observatory:
1. **Declare the Tab in `NAV_GROUPS`:**  
   In `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js`, add a dedicated entry under a new or existing group:
   ```javascript
   {
     section: 'Player Lore & Mechanics Wiki',
     items: [
       { id: 'wiki', label: '📚 Game Systems Wiki', panel: true, countKey: () => atlasPanelCount('wiki') }
     ]
   }
   ```
2. **Register the Panel in `registry.mjs`:**  
   Add `"wiki"` to `PANEL_TABS` in `atelier/atlas-world-panels/js/panels/registry.mjs`.
3. **Implement `atelier/atlas-world-panels/js/panels/wiki.mjs`:**  
   Export and register the panel implementation:
   ```javascript
   import { register } from "./registry.mjs";
   register("wiki", {
     mount(el, params) { /* Mount two-column layout: system nav + markdown article */ },
     show(params) { /* Load selected system article, highlight active TOC */ },
     hide() { /* Unbind keyboard listeners */ },
     count() { return 27; /* Total system count */ }
   });
   ```
4. **Update the Parity Suite (`panel-parity.test.mjs`):**  
   Add the mapping entry to `TAB_MAP` in `atelier/atlas-world-panels/tests/panel-parity.test.mjs`:
   ```javascript
   wiki: { tab: "wiki", panel: "wiki" }
   ```
   This ensures that no tab is left as an orphaned placeholder and that the registry, frontend, and tests agree completely.

### 3. The Parity-Gate Pattern (`tests/maps-index.test.mjs`)
The repository maintains an ironclad architectural standard: *"Every produced artifact must be observable in a review surface, and every game system must have verifiable documentation."*

In `atelier/atlas-world-panels/tests/maps-index.test.mjs`, this standard is made mechanical:
- The test suite inspects a committed index manifest (`maps-index.json`).
- It iterates through every canonical sheet registered in code (`atelier/mapforge/render-sheet.mjs`), asserting that every sheet ID is present in the index.
- It tests that physical preview rasters exist on disk, satisfy strict file-size budgets, and actually contain graphic content rather than blank placeholders (`inkFraction` floor check).
- It verifies that every entry carries a non-empty human title and descriptive note explaining what it is.

**Applying This Gate to the Game Wiki:**  
A companion parity test—`atelier/atlas-world-panels/tests/wiki-index.test.mjs`—can enforce:
1. **Catalog Completeness:** Every system identified in `server-rs/src/**` and listed in `docs/research/game-wiki-inventory-2026-10-30.md` must have an authored markdown document under `docs/wiki/systems/<system-id>.md`.
2. **Schema & Section Enforcement:** Every wiki article must contain the mandatory standard template headings: `# Quick Overview & Infobox`, `## Core Mechanics`, `## Mathematical Formulas`, and `## Engine Verification`.
3. **Zero Dead Links / Stale Code Anchors:** The test automatically parses file paths and symbol declarations cited in the article, verifying that each referenced file actually exists in the tree.
4. **CI & Gate 1 Blocking:** If a developer implements a new combat mechanic or mob tier in Rust without committing the matching player wiki article, `node atelier/atlas-world-panels/tests/wiki-index.test.mjs` will fail immediately, halting promotion.

---

## Section C: Reference MMORPG Wiki Patterns

*(Summarized from established MMORPG knowledge; no external web queries or fabricated URLs)*

### 1. iRO Wiki (Ragnarok Online Classic Wiki)
*Pattern:* Mechanics-First Informational Architecture with Prominent Calculation Callouts.  
*Structure:* Pages open with a standardized floating Infobox summarizing elemental properties (Level, Element, Race, Size), core defensive ratings (Soft DEF vs Hard DEF, MDEF), and complete loot tables with exact percentage rates down to 0.01%. Directly following the summary, mechanics pages feature dedicated LaTeX / monospaced Formula Callout Boxes that explain exact server formulas (e.g., ASPD formula distinguishing weapon base delay, AGI, and potion bonuses; Cast Time splitting fixed cast from variable cast). Skill and quest pages feature chronological walkthrough checklists with required items, NPC map coordinates, and prerequisite skill trees.

### 2. Lineage II Wiki (L2J Central / Official Encyclopedias)
*Pattern:* High-Stakes Progressive Progression Tables and Raid Encounter Specifications.  
*Structure:* Centered on progressive item enhancement and rigid group composition, Lineage II wiki layouts emphasize deep, color-coded tabular matrices. Enchanting pages feature multi-column tables tracking gear enhancement from +0 through +20, clearly delineating safe thresholds (+3/+4), success percentage decay, weapon physical/magical damage delta curves, failure break consequences (item destruction into crystal quantities by grade), and weapon glow hues (Faint blue, Pulsing red, Radiant violet). Buff mechanics pages categorize skills into distinct stacking tiers (Standard Prophet/Bishop buffs vs Bladedancer Dances and Swordsinger Songs), while Boss and Grand Boss dossiers specify enrage countdown timers, minion spawn intervals, crowd control vulnerabilities, and MVP/Last-Hit reward allocation formulas.

### 3. Old School RuneScape (OSRS) Wiki
*Pattern:* Modular, Data-Driven Transclusion with Real-Time Interactive Calculators.  
*Structure:* Widely regarded as the industry benchmark for data fidelity, the OSRS wiki builds pages almost entirely from transcluded backend modules. Rather than hardcoding text, pages query structured JSON/Lua data repositories for monster drops, equipment offensive bonuses, and quest states. Mechanics pages integrate client-side JavaScript calculators directly into the body—allowing players to input their current combat levels and equipped gear to compute exact DPS, hit chances, and remaining XP to the next level. Drop tables feature expandable nested sections that differentiate primary rolls, secondary tertiary rolls, and rare drop tables (RDT), accompanied by clear crowd-sourced sample size indicators.

### 4. Guild Wars 2 & Wowpedia (Modern MMORPG Wiki Standard)
*Pattern:* Dual-Lens Ability Cards with Split PvE/PvP Balancing and Visual Breadcrumbs.  
*Structure:* Modern wiki articles prioritize visual scanning and split-environment balancing. Individual skill and trait dossiers feature standardized ability cards displaying cast duration, activation delay, initiative/resource cost, cooldown, range, and combo field / combo finisher interactions. Below the summary, pages feature tabbed viewports comparing PvE damage coefficients against competitive PvP/WvW reduced coefficients. Environmental and quest entries incorporate visual map breadcrumbs, showing miniature map radar snapshots alongside step-by-step trigger explanations and dialogue transcripts.

---

## Section D: Recommended Information Architecture & Templates

### 1. Recommended Page Taxonomy & Directory Structure
```
docs/wiki/
├── README.md                           # Wiki portal hub and reading guide
├── index.json                          # Machine-readable parity manifest
├── systems/                            # Deep system and mechanics specifications
│   ├── races-and-stats.md              # 6 Playable races, primary stats & derived stats
│   ├── aspd-and-cast-speed.md          # Attack speeds, casting reduction & animation locks
│   ├── combat-and-damage.md            # Damage formulas, P.DEF/M.DEF armor mitigation
│   ├── elements-and-affinities.md      # 7-element counter cycle & damage multipliers
│   ├── enchanting-forge.md             # +0 to +20 High-Stakes forge, odds & crystallization
│   ├── card-sockets-and-abilities.md   # Monster card compounding & special abilities
│   ├── buffs-auras-and-songs.md        # 24 Standard buff slots, 12 songs & aura ranges
│   ├── cast-interruption.md            # Damage interruption rules & poise mechanics
│   ├── boss-encounters-and-mvp.md      # Boss phases, 50% HP threshold, enrage & MVP points
│   ├── dungeons-and-spires.md          # 60 Compiled spires, floor progression & portal egress
│   ├── parties-friends-and-chat.md     # Party grouping, friend locator & chat channels
│   ├── currency-and-vendors.md         # Gold economy, merchant buy/sell & price ledgers
│   ├── loot-drops-and-pickup.md        # Mob tier loot drops, ground items & pickup radius
│   ├── story-quests-and-lore.md        # 28 Story quests, dialogue triggers & rewards
│   ├── experience-and-leveling.md      # XP curve (100*lvl), level-up bonuses & stat gains
│   ├── death-bind-and-travel.md        # 10% Death XP loss, bind shrines & fast travel
│   ├── companions-and-pets.md          # AI followers, combat aggro & 30s respawn timer
│   ├── bestiary-and-mob-ai.md          # 116 Fauna, 5 mob tiers & behavior state trees
│   ├── world-regions-and-towns.md      # Continents, starter towns, heightfields & biomes
│   ├── inventory-and-equipment.md      # Stacked inventory & weapon/armor/accessory slots
│   ├── weapon-swap-and-hotbars.md      # Weapon switching & 4-slot skill loadouts
│   ├── projectiles-and-aiming.md       # Directional ballistics & ranged missile physics
│   ├── ground-aoe-and-fields.md        # Persistent spell zones & tick damage fields
│   ├── status-effects-and-dots.md      # Poison, burn, freeze, stun & silence ailments
│   ├── parry-and-defense.md            # Active guard, stamina consumption & poise
│   ├── terrain-elevation-and-speed.md  # Road/water/mud speed multipliers & cliff collision
│   └── spatial-world-handoff.md        # Seamless region boundaries & border ghosting
└── templates/
    └── system-page-template.md         # Standard markdown skeleton for new systems
```

---

### 2. Standard System Page Template Specification

Every system wiki article must follow this standardized template to ensure consistent presentation across the entire knowledge base:

````markdown
# [System Name: e.g., High-Stakes +20 Enchanting Forge]

> **System Category:** [Equipment & Progression | Combat Mechanics | World & Dungeons | Social]  
> **Server Engine Authority:** `server-rs/src/content/enchantment.rs:112`  
> **Player Availability:** Live in Game Client & Web Observatory Tab `enchant`  
> **Target Audience:** All Players / Crafters / Theorycrafters  

---

## 1. Quick Overview & Infobox
A 2-3 paragraph plain-language introduction explaining:
- What this system does in the game world.
- Why players should engage with it and what risks or rewards it offers.
- Key quick facts box (e.g., Maximum Cap: +20, Safe Limit: +4, Primary Materials: Enchant Scrolls).

---

## 2. Core Mechanics & Player Rules
Step-by-step breakdown of how the system functions in gameplay:
- **Prerequisites & Activation:** Level requirements, NPC locations, or UI triggers.
- **Workflow:** Sequential explanation of the player's interaction loop.
- **Rules & Restrictions:** Safe limits, item lockouts, trade restrictions, or combat states.
- **Failure Consequences:** What happens when an action fails (e.g., loss of scroll, item downgrade, or crystallization into materials).

---

## 3. Mathematical Formulas & Calculation Tables
The exact server-authoritative mathematical formulas extracted from Rust engine code:
- **Formula Monospace Box:**
  ```text
  Success Chance (bps) = match tier {
      0..=3 => 10,000 (100.0%)
      4 => 7,000 (70.0%)
      ...
      19 => 400 (4.0%)
  }
  ```
- **Variable Definitions:** Exact definition and clamping limits for every input variable.
- **Worked Example:** A concrete calculation demonstrating a typical player scenario.

---

## 4. Authoritative Data Tables & Rates
Direct tabular representations of the game data:
- Progression charts (+0 to +20 stat gains, success rates, failure yields).
- Item catalogs or drop tables with exact percentage chances.
- Visual effect tiers (e.g., glow hues, sound effects).

---

## 5. UI Controls & In-Game Interaction
Practical guidance on how the player interacts with the feature:
- UI window location, hotkeys, and menu navigation.
- Indicator explanations (visual cues, chat notifications, audio indicators).
- Tips and best practices for optimal play.

---

## 6. Engine Verification & Data Provenance
Spot-checkable technical references establishing that the page is grounded in actual game code:
- **Engine Source:** File and line reference in `server-rs/src/**`.
- **Data Catalog:** JSON file path in `content/**` or `contracts/**`.
- **Unit & Integration Tests:** Test files in `server-rs/tests/**` confirming the mechanics.
- **Review Status:** [Verified against Rust engine codebase | Unverified where pending implementation]
````

---

## Summary of Verification Checks

1. **Section A Coverage:** 27 distinct game systems cataloged (exceeding the >=18 requirement). Every row carries a spot-checked, non-invented file and line anchor in `server-rs/src/**`, verified data catalogs in `content/**` or `contracts/**`, existing builder documentation, and current visibility status.
2. **Section B Completeness:** Complete architectural breakdown of how `catalog_explorer_web.py` and `atelier/atlas-world-panels` manage inline tabs vs `panel: true` mounted panels, actionable blueprint for adding a `wiki` tab, and integration with the mechanical parity-gate pattern from `atelier/atlas-world-panels/tests/maps-index.test.mjs`.
3. **Section C Reference Patterns:** 4 classic MMORPG wiki models (iRO Wiki, Lineage II, OSRS, Guild Wars 2/Wowpedia) summarized from domain knowledge without fabricated URLs.
4. **Section D Information Architecture:** Full 27-system hierarchical directory structure and complete 6-part standardized system page template.
