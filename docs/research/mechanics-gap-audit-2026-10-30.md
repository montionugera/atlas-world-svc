# Atlas World MMORPG Mechanics Completeness Gap Audit (`server-rs`)

- **Audit Date:** 2026-10-30
- **Scope:** Authoritative Rust game server (`server-rs/src/**`, `server-rs/tests/**`), world & contract content (`content/**`, `content/studio/world_history_and_concept.json`, `contracts/content/**`), and React WebSocket/HTTP client (`client/react-client/src/**`).
- **Mode:** Research-only completeness audit against the 19 target Ragnarok Online (RO) / Lineage II (L2) MMORPG mechanics to prioritize the next build waves.

---

## 1. Executive Summary

Across all **19 target mechanics**, **`server-rs` has domain structs, pure calculation functions, and unit/integration tests for 19/19**, but **0 of the 19 are `complete` end-to-end** in live gameplay (`19/19 partial`).

Three systemic architectural disconnects explain almost every gap:
1. **Isolated Subsystem Silos (ECS Library vs. Live `AtlasSimulation` Schedule vs. `RustMetaEngine` Persistence):**
   - `loot_drop_on_kill_system`, `loot_pickup_system`, `companion_follow_system`, `companion_combat_system`, and `companion_respawn_system` exist and pass isolated unit tests, but are **not registered** in `AtlasSimulation::new` (`server-rs/src/simulation.rs:191-214`).
   - `BossEncounterState`, floor progression, and MVP reward calculations live in `DungeonRegistry` (`server-rs/src/fleet/dungeons.rs`) driven by manual HTTP routes (`/dungeon/*` in `server-rs/src/net/ws.rs:1780-2235`), while `DungeonEncounterLink` (`server-rs/src/ecs/components.rs:61-73`) is **never queried** by any ECS system and no `AtlasSimulation` room is ever spawned for allocated dungeon instances (`server-rs/src/main.rs:432-452`).
   - Social systems (`parties`, `friends`, `chat`), `vendor_buy_item` / `vendor_sell_item`, `PlayerWallet` (gold), and `set_bind_point` / `fast_travel_to_waypoint` exist only as in-memory Bevy `World` helper functions in `server-rs/src/systems/social.rs` and `server-rs/src/systems/progression.rs` with **zero HTTP/RPC or WebSocket wire bindings**.
2. **Computed-but-Unapplied Combat & Stat Curves:**
   - `DerivedStats` (`server-rs/src/content/stats.rs:18-116`) and `BuffContainer::aggregate_multipliers()` (`server-rs/src/combat/buffs.rs:173-189`) compute `aspd`, `cast_time_reduction_pct`, `crit_rate_pct`, `hit_rate`, `flee_rate`, `max_weight`, `p_atk_mult`, `m_atk_mult`, and `move_speed_mult`, and `enchantment.rs` computes `+1..+20` stat multipliers and `SpecialAbility` bonuses — yet `spawn_player_avatar_with_loadout` (`server-rs/src/simulation.rs:1338-1419`), `combat_system` (`server-rs/src/systems/combat.rs:78-295`), `projectile_collision_system` (`server-rs/src/systems/projectile.rs:33-562`), and `skill_execution_system` (`server-rs/src/systems/skill_execution.rs:31-343`) ignore them.
   - Live mob attacks and ranged player attacks resolve through `projectile_collision_system` (`server-rs/src/systems/projectile.rs:33-562`), which **never checks or cancels `CastingState`**, meaning direct damage in live rooms does not interrupt spell casts.
3. **Client-Trusted RNG & Split Content Catalogs:**
   - `rpc_enchant_equipment` (`server-rs/src/meta/engine.rs:960-977`) reads `rollBps`, `isBlessed`, and `hasProtectionStone` directly from the client's JSON payload without server-side PRNG or inventory consumption, allowing trivial client-side `rollBps: 0` exploits to guarantee `+20` equipment.
   - Quest definitions are split across three incompatible files (`content/story/quests.json` with 28 quests, `contracts/content/quests.json` with 3 quests, and `contracts/content/quest_board.json` with 8 quests), and `React` (`client/react-client/src/**`) only exposes canvas rendering for races, weapon glow, companions, and `DungeonHUD` (which itself is not mounted in `ColyseusGameCanvas.tsx`).

---

## 2. Master Completeness Matrix (All 19 Target Mechanics)

| # | Target Mechanic | Status | Server Evidence (`server-rs/src/**`) | Test Coverage (`server-rs/tests/*_test.rs`) | Content Data (`content/**` & `contracts/content/**`) | React Client Exposure (`client/react-client/src/**`) |
|---|---|---|---|---|---|---|
| 1 | **6 canonical races** | `partial` | `server-rs/src/content/races.rs:7-242`; `server-rs/src/content/stats.rs:52-116`; `server-rs/src/ecs/components.rs:9-17`; `server-rs/src/simulation.rs:1153-1155,1354-1359,1414` | `server-rs/tests/race_and_attributes_test.rs:9-126` (plus unit tests in `server-rs/src/content/races.rs:244-289`) | `content/studio/world_history_and_concept.json:318-488,1166-1209,1682-1749` | Paperdoll & scale rendered (`client/react-client/src/renderers/playerRenderer.ts:24-215,406-442`, `client/react-client/src/protocol/BinaryDeltaDecoder.ts:7,39,103`); no race selection UI |
| 2 | **6 primary stats** | `partial` | `server-rs/src/storage/nakama.rs:17-54`; `server-rs/src/content/stats.rs:18-116`; `server-rs/src/content/mmorpg.rs:656-725`; `server-rs/src/meta/engine.rs:1110-1204`; `server-rs/src/simulation.rs:1349-1402` | `server-rs/tests/race_and_attributes_test.rs:83-169`; `server-rs/tests/rust_meta_engine.rs:209-224` | `content/studio/world_history_and_concept.json:318-488`; `contracts/content/jobs.json:1-85`; `contracts/content/items.json:1-46` | Not exposed (`not found (searched: allocate_stats, PrimaryStats, str/agi/vit/int/dex/luk in client/react-client/src)`) |
| 3 | **ASPD and cast-time curves** | `partial` | `server-rs/src/content/stats.rs:25-26,92-94`; `server-rs/src/combat/buffs.rs:39-41,184-185`; `server-rs/src/systems/combat.rs:112,179`; `server-rs/src/systems/skill_execution.rs:324`; `server-rs/src/simulation.rs:1388-1395` | `server-rs/tests/race_and_attributes_test.rs:83-126` (unit tests in `server-rs/src/content/stats.rs:163-194`) | `content/studio/world_history_and_concept.json:948-954,1043-1049,1288-1291`; `contracts/content/skills.json` | Static cast bar & hardcoded 800ms swing cycle (`client/react-client/src/renderers/playerRenderer.ts:12-13,498-522`, `client/react-client/src/config/skills.ts:16-82`, `client/react-client/src/components/ColyseusGameCanvas.tsx:282-300`) |
| 4 | **+20 high-stakes enchanting** | `partial` | `server-rs/src/content/enchantment.rs:4-203,257-267`; `server-rs/src/meta/engine.rs:358-362,953-1041`; `server-rs/src/ecs/components.rs:20-29`; `server-rs/src/simulation.rs:1156-1158,1361,1415`; legacy +15 in `server-rs/src/content/mmorpg.rs:511-577` | `server-rs/tests/enchant_and_sockets_test.rs:6-107` (plus unit tests in `server-rs/src/content/enchantment.rs:269-328`) | `content/studio/world_history_and_concept.json:687-703,876,905,1096,1134`; `contracts/content/items.json:1-65` | Weapon glow +4..+20 rendered on canvas (`client/react-client/src/renderers/playerRenderer.ts:218-379,445-454`, `client/react-client/src/protocol/BinaryDeltaDecoder.ts:8,41,104`); no enchanting UI/RPC call |
| 5 | **4-slot card sockets with special abilities** | `partial` | `server-rs/src/content/enchantment.rs:36-63,205-255`; `server-rs/src/meta/engine.rs:363-367,1043-1108`; `server-rs/src/content/mmorpg.rs:110-120,616-654` | `server-rs/tests/enchant_and_sockets_test.rs:108-140` (unit tests in `server-rs/src/content/enchantment.rs:331-347`, `server-rs/src/content/mmorpg.rs:1082-1097`) | `contracts/content/cards.json:1-38`; `contracts/content/mobs.json:23,48,72,96`; `content/studio/world_history_and_concept.json:694,755,771,1004,1134,1263` | Not exposed (`not found (searched: socket_card, socketedCardIds, SpecialAbility, card_ in client/react-client/src)`) |
| 6 | **24 standard buff slots + 12 song/dance slots** | `partial` | `server-rs/src/combat/buffs.rs:4-217`; `server-rs/src/systems/combat.rs:430-466`; `server-rs/src/simulation.rs:195,1345,1413` | `server-rs/tests/combat_buffs_and_auras_test.rs:5-103`; `server-rs/tests/aura_spatial_bench_test.rs:11-246` | `content/studio/world_history_and_concept.json:929,1005,1078,1116,1238,1270` | Only `freeze`/`stun` status icons rendered (`client/react-client/src/renderers/playerRenderer.ts:557-583`, `client/react-client/src/components/EntityCard.tsx:148-174`); no 24+12 buff bar |
| 7 | **Spatial portal triggers (Bevy ECS)** | `partial` | `server-rs/src/ecs/components.rs:31-57,79-91`; `server-rs/src/systems/portal.rs:9-62`; `server-rs/src/simulation.rs:171,211,362-374,1070,1435-1442`; `server-rs/src/main.rs:432-452` | `server-rs/tests/dungeon_spire_and_catalog_test.rs:42-93`; `server-rs/tests/dungeon_gateway_allocation_test.rs:9-68` (unit tests in `server-rs/src/systems/portal.rs:64-114`) | `content/dungeons/catalog.json` (60 portals); `content/maps/*.json`; `content/studio/world_history_and_concept.json:1305-1680` | Not rendered on canvas; manual HTTP helper `enterDungeon` in `client/react-client/src/hooks/useServerRsClient.ts:1145-1199` |
| 8 | **Agones match allocation** | `partial` | `server-rs/src/fleet/agones.rs:11-318`; `server-rs/src/main.rs:222-230,611-616`; `server-rs/src/net/ws.rs:602-616,1914-1917` | `server-rs/tests/fleet_and_auth.rs:12-42,122-142`; `server-rs/tests/dungeon_gateway_allocation_test.rs:9-68,124-126` | N/A (infrastructure / fleet orchestration) | N/A (server-side fleet lifecycle; client receives room reassignment on existing WS in `client/react-client/src/hooks/useServerRsClient.ts:1166-1195`) |
| 9 | **Boss phases and enrage** | `partial` | `server-rs/src/fleet/dungeons.rs:16-204,684-745`; `server-rs/src/ecs/components.rs:61-73,291-323`; `server-rs/src/systems/mob_lifecycle.rs:59-70`; `server-rs/src/net/ws.rs:1939-1994,2078-2119` | `server-rs/tests/dungeon_boss_encounter_test.rs:10-202`; `server-rs/tests/boss_tier_scaling_test.rs:20-118`; `server-rs/tests/dungeon_spire_and_catalog_test.rs:161-197` | `content/dungeons/catalog.json` (`mvp_boss_id`, `mvp_boss_hp`, `boss_enrage_secs`); `content/studio/world_history_and_concept.json:65-183,593-684,738-773` | `DungeonHUD` component built (`client/react-client/src/components/DungeonHUD.tsx:215-395`, `client/react-client/src/types/game.ts:159-168`), but `DungeonHUD` is imported yet never rendered in `client/react-client/src/components/ColyseusGameCanvas.tsx:57` |
| 10 | **RO/L2-style weighted MVP reward distribution** | `partial` | `server-rs/src/fleet/dungeons.rs:206-214,283-358,561-625,684-714`; `server-rs/src/net/ws.rs:1964-1980` | `server-rs/tests/dungeon_boss_encounter_test.rs:86-104,198-202`; `server-rs/tests/dungeon_wipe_and_mvp_healing_test.rs:8-68`; `server-rs/tests/dungeon_spire_and_catalog_test.rs:186-192` | `content/studio/world_history_and_concept.json:738-764`; `contracts/content/mobs.json:76-98` (`orc_warlord` `isMvp: true`) | Not exposed (`not found (searched: mvpRewards, isMvpWinner, mvp_crown_of_victory in client/react-client/src)`) |
| 11 | **Cast interruption by direct damage** | `partial` | `server-rs/src/ecs/components.rs:183-214`; `server-rs/src/systems/combat.rs:240-244`; `server-rs/src/systems/skill_execution.rs:47-51`; missing in `server-rs/src/systems/projectile.rs:33-562` | `server-rs/tests/cast_interruption_test.rs:1-98` | `contracts/content/skills.json`; `content/studio/world_history_and_concept.json:1265` (`Endure`) | Local timer-driven cast bar (`client/react-client/src/components/ColyseusGameCanvas.tsx:282-300,439-442`, `client/react-client/src/renderers/playerRenderer.ts:498-522`); server `CastingState` not in FlatBuffers `EntityDelta` |
| 12 | **Boss wipe = 100% reset** | `partial` | `server-rs/src/fleet/dungeons.rs:191-203,627-646` | `server-rs/tests/dungeon_wipe_and_mvp_healing_test.rs:71-108` | `content/dungeons/catalog.json` | Not exposed (`not found (searched: PartyWipe, check_party_wipe, boss reset in client/react-client/src)`) |
| 13 | **Seamless overworld <-> instanced dungeon entry/egress** | `partial` | `server-rs/src/systems/portal.rs:9-62`; `server-rs/src/main.rs:432-452`; `server-rs/src/net/ws.rs:573-628,1826-1938,2135-2200`; `server-rs/src/fleet/dungeons.rs:593-608,652-681` | `server-rs/tests/dungeon_gateway_allocation_test.rs:9-180`; `server-rs/tests/dungeon_egress_test.rs:4-92`; `server-rs/tests/dungeon_spire_and_catalog_test.rs:42-197` | `content/dungeons/catalog.json` (60 dungeons); `content/studio/world_history_and_concept.json:799-805,822-826,843-847,1441-1490` | `enterDungeon`, `advanceDungeonFloor`, `egressDungeon` in `client/react-client/src/hooks/useServerRsClient.ts:1145-1295` and `DungeonHUD.tsx:46-213,397-463` (unmounted in `ColyseusGameCanvas.tsx:57`) |
| 14 | **Parties, friends, chat** | `partial` | `server-rs/src/systems/social.rs:16-700` | `server-rs/tests/nearby_and_world_chat_test.rs:10-128`; `server-rs/tests/friends_list_test.rs:9-57`; `server-rs/tests/parties_test.rs:12-110`; `server-rs/tests/find_and_join_friends_test.rs:11-78` | `content/studio/world_history_and_concept.json:704-714,775-849,1216,1426-1434` | Not exposed (only `partyId` arg on `enterDungeon` in `client/react-client/src/hooks/useServerRsClient.ts:1148`; no chat/friends/party UI) |
| 15 | **Quests** | `partial` | `server-rs/src/systems/progression.rs:554-767`; `server-rs/src/meta/engine.rs:348-357,501-700,1277-1456`; `server-rs/src/content/mmorpg.rs:140-181,252-253` | `server-rs/tests/quests_at_runtime_test.rs:10-108`; `server-rs/tests/rust_meta_engine.rs:225-234`; `server-rs/tests/nakama_persistence.rs` | `content/story/quests.json:1-726` (28 quests); `contracts/content/quests.json:1-32` (3 quests); `contracts/content/quest_board.json:1-173` (8 quests); `content/studio/world_history_and_concept.json:715-736` | Not exposed (`not found (searched: accept_quest, claim_quest_reward, quests in client/react-client/src)`) |
| 16 | **Loot** | `partial` | `server-rs/src/content/item_catalog.rs:30-37,206-235`; `server-rs/src/systems/progression.rs:130-234`; `server-rs/src/meta/engine.rs:328-332,750-865`; `server-rs/src/content/mmorpg.rs:64-93` | `server-rs/tests/loot_drops_and_pickup_test.rs:19-108`; `server-rs/tests/idempotent_grants_test.rs:20-169`; `server-rs/tests/minimal_item_catalogue_test.rs:48-68` | `contracts/content/mobs.json:19-22,43-47,68-71,92-95`; `contracts/content/items.json:1-65`; `content/studio/world_history_and_concept.json:497-590,747,755,763,771` | Not exposed (`not found (searched: LootDrop, grant_loot, loot in client/react-client/src)`) |
| 17 | **Currency/vendors** | `partial` | `server-rs/src/ecs/components.rs:346-352` (`PlayerWallet`); `server-rs/src/content/item_catalog.rs:19-28,57-190`; `server-rs/src/systems/progression.rs:484-552` | `server-rs/tests/currency_and_vendor_test.rs:9-85` | `content/studio/world_history_and_concept.json:687-714` | Not exposed (`not found (searched: vendor_buy, vendor_sell, gold, wallet in client/react-client/src)`) |
| 18 | **Death/bind/travel** | `partial` | `server-rs/src/systems/live.rs:287-336`; `server-rs/src/ecs/components.rs:354-386`; `server-rs/src/systems/progression.rs:15,380-482`; `server-rs/src/meta/engine.rs:702-748` | `server-rs/tests/death_bind_and_travel_test.rs:13-106`; `server-rs/tests/live_runtime.rs` | `content/towns/town-millcross.json`; `content/zones/*.json`; `content/studio/world_history_and_concept.json:878,1159,1305-1749` | `respawn` action & button (`client/react-client/src/hooks/useServerRsClient.ts:1339-1350`, `client/react-client/src/components/EntityCard.tsx:44,217-221`); no bind point or fast-travel UI |
| 19 | **Companions** | `partial` | `server-rs/src/ecs/components.rs:238-285`; `server-rs/src/systems/companion.rs:9-287`; `server-rs/src/systems/progression.rs:116-124` | `server-rs/tests/companion_spawn_follow_test.rs:21-105`; `server-rs/tests/companion_combat_respawn_test.rs:39-167` | `not found (searched: companion, pet, homunculus across content/ and contracts/content/)` | `drawCompanions` & `Companion` type exist (`client/react-client/src/renderers/companionRenderer.ts:11-107`, `client/react-client/src/types/game.ts:71-75`, `client/react-client/src/components/GameRenderer.tsx:409-412`), but `useServerRsClient.ts:622-731` never populates `npcs`/`companions` |

---

## 3. Per-Mechanic Deep Audit (Mechanics 1–19)

### Mechanic 1: 6 Canonical Races
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/content/races.rs:7-30` defines `AtlasRace` with all 6 canonical variants (`HumanDemiHuman`, `Dwarf`, `OgreOrc`, `Furral`, `Lunar`, `DarkLunar`).
  - `server-rs/src/content/races.rs:66-242` defines `RaceProfile` for each race with `home_town_id`, `home_town_name`, `continent_id`, `district_id`, `hunting_area_id`, `farming_area_id`, `convergence_hub_town_id`, `starter_level_band`, `base_str/agi/vit/int/dex/luk`, `hitbox_radius_m`, `hitbox_height_m`, `innate_trait_name`, `bonus_carry_weight`, `base_move_speed_bonus`, `innate_stun_resist_pct`, `innate_crit_rate_bonus_pct`, `elemental_affinity`, and `spawn_position`.
  - `server-rs/src/content/stats.rs:52-116` (`derived_stats_with_race`) applies `base_move_speed_bonus`, `innate_crit_rate_bonus_pct`, and `bonus_carry_weight`.
  - `server-rs/src/ecs/components.rs:9-17` defines `RaceComponent`; `server-rs/src/simulation.rs:1153-1155,1354-1359,1414` attaches `RaceComponent` on avatar spawn and serializes `race` into `EntitySnapshotData`.
  - **Tests:** `server-rs/tests/race_and_attributes_test.rs:9-126` and unit tests in `server-rs/src/content/races.rs:244-289`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - `[RO/L2 Reference Knowledge + Codebase Gap]` In Lineage II (Human, Elf, Dark Elf, Orc, Dwarf, Kamael) and Ragnarok Online (Doram/Human racial traits & racial damage/reduction cards like Hydra/Thara Frog), a character's chosen race determines their starting village spawn coordinates, base primary attributes, collision capsule radius, elemental/status resistances, and racial active/passive combat traits, plus interacts with racial damage/resistance modifiers (`demiHumanResistPct` in `contracts/content/cards.json:34`).
  - In `server-rs`, only 3 of the 15 `RaceProfile` gameplay fields are wired into `derived_stats_with_race` (`server-rs/src/content/stats.rs:78-115`):
    1. **No character creation / race selection RPC:** `RustMetaEngine::invoke_rpc` (`server-rs/src/meta/engine.rs:291-370`) has no `select_race` or character creation RPC; `ProfileDoc::default()` (`server-rs/src/meta/models.rs`) leaves `race: None`, defaulting every player to `HumanDemiHuman` (`server-rs/src/simulation.rs:1357`).
    2. **Hitbox radius ignored in physics:** `spawn_player_avatar_with_loadout` (`server-rs/src/simulation.rs:1405`) hardcodes `BodyRadius(PLAYER_BODY_RADIUS)` (`12.0`) instead of scaling by `profile.hitbox_radius_m` (`0.38m` Dwarf vs `0.62m` Ogre/Orc), even though the React client (`client/react-client/src/renderers/playerRenderer.ts:24-33`) scales the drawn circle by `0.82x` / `1.25x`.
    3. **Racial base stats, stun resist, elemental affinity, and starter town spawn ignored:** `spawn_player_avatar_with_loadout` (`server-rs/src/simulation.rs:1349-1402`) ignores `profile.base_str..base_luk`, hardcodes `ElementalAttributes::new(Element::Neutral)` at line `1397` instead of `profile.elemental_affinity`, ignores `profile.innate_stun_resist_pct`, and does not spawn Lv.1 characters at `profile.spawn_position` / `profile.home_town_id`.
    4. **Racial innate traits unimplemented in combat:** None of the 6 signature traits in `server-rs/src/content/races.rs:101-235` (Ogre/Orc low-HP Blood-Fury cleave scaling, Furral Electro chain-lightning shock, Lunar extended bow/spell reach, Dark-Lunar backstab amplification, Dwarf knockdown force) are evaluated in `combat_system` or `projectile_collision_system`.
- **Content Data (`content/` & `content/studio/world_history_and_concept.json`):**
  - Present in `content/studio/world_history_and_concept.json:318-488` (`race_taxonomy.playable_and_mob_races`), `1166-1209` (`racial_starter_routes`), `1308-1425` (`stage_a_spokes_1_to_10`), and `1682-1749` (`starter_town_bindings`). Also 6 monster-only ecology races at `489-592`.
- **React Client Exposure (`client/react-client/src`):**
  - Partial: `client/react-client/src/protocol/BinaryDeltaDecoder.ts:7,39,103` decodes `race: Race` from FlatBuffers `EntityDelta`; `client/react-client/src/hooks/useServerRsClient.ts:679` stores `race` on `Player`; `client/react-client/src/renderers/playerRenderer.ts:24-215,406-442` scales player radius (`getRaceScaleFactor`) and renders distinct racial paperdolls (`drawRacePaperdoll`). However, there is no UI to choose or display race in `App.tsx` or `EntityCard.tsx`.
- **Sized Next Increment Spec:**
  - **goal:** Wire `AtlasRace` selection into `RustMetaEngine` (`select_race` RPC initializing `ProfileDoc.race`, `ProfileDoc.allocated` from `RaceProfile` base stats, and starter `CharacterStateDoc` at `profile.home_town_id` / `profile.spawn_position`) and apply `RaceProfile` hitbox scaling (`BodyRadius`), `elemental_affinity`, and `innate_stun_resist_pct` in `AtlasSimulation::spawn_player_avatar_with_loadout`.
  - **acceptance:** Calling `POST /v2/rpc/select_race` with `{"race":"dwarf"}` sets `ProfileDoc.race = Some("dwarf")`, initializes `allocated` to Dwarf base stats (`50 STR, 32 AGI, 42 VIT, 20 INT, 36 DEX, 25 LUK`), and spawning the avatar in `AtlasSimulation` sets `BodyRadius` scaled by `0.38 / 0.45`, `ElementalAttributes` to `Element::Earth`, and `StatusEffects` stun resistance to `15%`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test race_and_attributes_test`

---

### Mechanic 2: 6 Primary Stats (`STR`, `AGI`, `VIT`, `INT`, `DEX`, `LUK`)
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/storage/nakama.rs:17-54` defines `PrimaryStats { str, agi, int, vit, dex, luk }`.
  - `server-rs/src/content/stats.rs:18-116` computes `DerivedStats` (`max_health`, `p_atk`, `m_atk`, `p_def`, `m_def`, `aspd`, `cast_time_reduction_pct`, `crit_rate_pct`, `hit_rate`, `flee_rate`, `max_move_speed`, `max_weight`) from `level`, `PrimaryStats`, weapon, and `AtlasRace`.
  - `server-rs/src/content/mmorpg.rs:656-725` computes `effective_stats_with_job` and `derived_stats_with_full_growth`.
  - `server-rs/src/meta/engine.rs:1110-1204` implements `rpc_allocate_stats` across all 6 stats.
  - **Tests:** `server-rs/tests/race_and_attributes_test.rs:83-169`, `server-rs/tests/rust_meta_engine.rs:209-224`, and unit tests in `server-rs/src/content/stats.rs:118-245`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - `[RO/L2 Reference Knowledge + Codebase Gap]` In Ragnarok Online, `DEX`/`LUK` govern `HIT` vs target `FLEE` (`AGI`/`LUK`) accuracy rolls, `LUK` governs critical hit rolls (`1.4x` defense-ignoring crits and Perfect Dodge `1 + LUK/10`), `STR` governs inventory weight capacity (50% weight blocks natural regen, 90% weight blocks attacking/casting), `INT`/`VIT` govern SP/HP pool & recovery, and raising a stat from `N` to `N+1` costs `floor((N-1)/10) + 2` stat points up to cap 99.
  - In `server-rs`:
    1. **`crit_rate_pct`, `hit_rate`, `flee_rate`, and `max_weight` are dead fields in live combat:** `spawn_player_avatar_with_loadout` (`server-rs/src/simulation.rs:1388-1401`) only copies `max_health`, `p_atk.max(m_atk)`, `p_def`, `m_def`, and `max_move_speed` into ECS components. Neither `combat_system` (`server-rs/src/systems/combat.rs:229-240`) nor `projectile_collision_system` (`server-rs/src/systems/projectile.rs:345-355,445-455`) nor `DamageCalculator` (`server-rs/src/combat/damage.rs:42-54`) rolls hit vs. flee accuracy or critical hits!
    2. **Physical/Magical stat conflation on avatar spawn:** `simulation.rs:1389` sets `CombatStats.attack_power = derived.p_atk.max(derived.m_atk)`, conflating STR/DEX physical attack and INT magical attack into a single scalar.
    3. **Flat 1:1 stat allocation cost & missing LUK job bonus:** `rpc_allocate_stats` (`server-rs/src/meta/engine.rs:1147-1167`) deducts a flat 1 `stat_point` per point regardless of current stat tier (no RO stepped cost curve or 99 base stat cap), and `effective_stats_with_job` (`server-rs/src/content/mmorpg.rs:665-673`) omits `luk` job bonuses (`luk: allocated.luk.max(1)`).
- **Content Data (`content/` & `content/studio/world_history_and_concept.json`):**
  - `contracts/content/jobs.json:1-85` defines `jobBonuses` (`str`, `agi`, `vit`, `int`, `dex`, `luk`) per job class; `contracts/content/items.json:1-46` defines `atkStat` (`"str"`, `"int"`, `"dex"`).
- **React Client Exposure (`client/react-client/src`):**
  - Missing: `not found (searched: allocate_stats, statPoints, PrimaryStats, crit_rate, flee_rate in client/react-client/src)`. Client only displays `level`, `xp`, and `health`/`maxHealth` (`client/react-client/src/types/game.ts:96-98,114-115`).
- **Sized Next Increment Spec:**
  - **goal:** Attach `DerivedStats` (or a `CombatSecondaryStats { m_atk, crit_rate_pct, hit_rate, flee_rate, max_weight }` component) to spawned avatars in `AtlasSimulation::spawn_player_avatar_with_loadout` and evaluate deterministic `Mulberry32` hit/flee miss rolls and `1.4x` critical hit rolls in `combat_system` and `projectile_collision_system`, plus fix `effective_stats_with_job` to include `luk` job bonuses.
  - **acceptance:** High-`LUK` avatars land critical hits (`1.4x` damage) at `crit_rate_pct` frequency in `combat_system` and `projectile_collision_system`, high-`FLEE` defenders evade low-`HIT` attacks, and `effective_stats_with_job` includes job `luk` bonuses.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test race_and_attributes_test`

---

### Mechanic 3: ASPD and Cast-Time Curves
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/content/stats.rs:92-94` computes `aspd = (1.0 + agi * 0.02 + dex * 0.005).min(5.0)` (attacks/sec, cap `5.0` = `0.2s` swing interval) and `cast_time_reduction_pct = (((dex * 0.6 + int * 0.4) / 1.5)).min(80.0)`.
  - `server-rs/src/combat/buffs.rs:39-41,184-185` aggregates `aspd_mult` and `cast_time_mult` across active buffs.
  - `server-rs/src/content/enchantment.rs:43-44` defines `SpecialAbility::Haste` (`+12% ASPD`) and `SpecialAbility::Acumen` (`+25% Cast Speed`).
  - **Tests:** `server-rs/tests/race_and_attributes_test.rs:83-126` and unit tests in `server-rs/src/content/stats.rs:163-194`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - `[RO/L2 Reference Knowledge + Codebase Gap]` In RO/L2, `ASPD` directly determines the auto-attack cooldown timer (`1.0 / aspd` seconds per swing, modified by weapon type base delay and Haste/Awakening potions), and `DEX`/`INT` + `Acumen`/Suffragium reduce skill casting duration before a spell fires (with RO splitting 20% fixed cast time and 80% variable cast time).
  - **Completely disconnected from live ECS combat and skill casting:**
    1. `spawn_player_avatar_with_loadout` (`server-rs/src/simulation.rs:1388-1395`) hardcodes `attack_cooldown: 0.8` instead of setting `attack_cooldown: 1.0 / derived.aspd`.
    2. `combat_system` (`server-rs/src/systems/combat.rs:112,179`) resets `stats.cooldown_timer = stats.attack_cooldown` without dividing by `BuffContainer::aggregate_multipliers().aspd_mult`.
    3. `skill_execution_system` (`server-rs/src/systems/skill_execution.rs:324`) calls `casting.start_cast(&skill.id, skill.casting_time_sec, current_time)` using raw `skill.casting_time_sec`, completely ignoring both `derived.cast_time_reduction_pct` and `BuffContainer::aggregate_multipliers().cast_time_mult`!
- **Content Data (`content/` & `content/studio/world_history_and_concept.json`):**
  - `content/studio/world_history_and_concept.json:953,1048,1289-1290` specifies `ASPD Booster (Awakening Clock-Spring Potion · +15% Attack Speed)` and `Magic Cast Speed Booster`. `contracts/content/skills.json` defines skill `castTimeMs` and `cooldownMs`.
- **React Client Exposure (`client/react-client/src`):**
  - Partial/Static: `client/react-client/src/renderers/playerRenderer.ts:12` hardcodes `const ATTACK_CYCLE_DURATION_MS = 800; // Matches server-rs attack_cooldown (0.8s)`, and `client/react-client/src/components/ColyseusGameCanvas.tsx:282-300` uses static `def.castTime * 1000` from `client/react-client/src/config/skills.ts:16-82` without scaling by player `DEX`/`INT` or buffs.
- **Sized Next Increment Spec:**
  - **goal:** Wire `derived.aspd`, `derived.cast_time_reduction_pct`, and `BuffContainer` (`aspd_mult`, `cast_time_mult`) into `AtlasSimulation::spawn_player_avatar_with_loadout`, `combat_system`, and `skill_execution_system`.
  - **acceptance:** Raising `AGI`/`DEX` or applying an `aspd_mult > 1.0` buff reduces `CombatStats.cooldown_timer` between auto-attacks in `combat_system` to `1.0 / (derived.aspd * aspd_mult).min(5.0)`, and raising `DEX`/`INT` or applying `cast_time_mult < 1.0` reduces `casting_until - current_time` in `skill_execution_system` by `(1.0 - cast_time_reduction_pct / 100.0) * cast_time_mult`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test combat_buffs_and_auras_test --test race_and_attributes_test`

---

### Mechanic 4: +20 High-Stakes Enchanting (Success Rates, Break/Downgrade on Failure)
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/content/enchantment.rs:4-203,257-267` implements `MAX_ENCHANT_TIER = 20`, `SAFE_ENCHANT_TIER = 4`, `EnchantVisualGlow` (`None` +0..+3, `FaintWhite` +4..+6, `LuminescentBlue` +7..+9, `RadiantRed` +10..+12, `AbyssalPurple` +13..+15, `CelestialGold` +16..+20), `enchant_success_rate_bps` (100% at +0..+3, 70% at +4, 52% at +7, 30% at +10, 12% at +15, 4% at +19), `attempt_high_tier_enchant` (Protection Stone prevents penalty; Blessed Scroll downgrades by 1 clamped at +4; standard failure at +5..+9 downgrades by 1; standard failure at +10..+19 shatters item into `current_tier * 75` crystals), and `compute_enchant_stat_multipliers`.
  - `server-rs/src/meta/engine.rs:358-362,953-1041` exposes `enchant_equipment` RPC persisting to `"item_enchant"` collection.
  - `server-rs/src/ecs/components.rs:20-29` (`WeaponGlowComponent`) and `server-rs/src/simulation.rs:1156-1158` replicate `enchant_glow` in FlatBuffers snapshots.
  - Note: A duplicate legacy `+15` refinement system (`MAX_REFINE_LEVEL = 15` with 3-fail pity) also exists in `server-rs/src/content/mmorpg.rs:511-577`.
  - **Tests:** `server-rs/tests/enchant_and_sockets_test.rs:6-107` and unit tests in `server-rs/src/content/enchantment.rs:269-328`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - `[RO/L2 Reference Knowledge + Codebase Gap]` In Lineage II / Ragnarok Origin, enchanting consumes an Enchant Scroll (Normal, Blessed, or Protection Stone) + gold/zeny, rolls server-authoritative RNG, permanently destroys the equipment item from inventory/equipped slots on a +10..+19 shatter while granting D/C/B/A/S-grade crystals to inventory, and applies the weapon's enchant ATK/DEF/HP bonus and visual glow to the live character in-world.
  - **Three critical gaps in `server-rs`:**
    1. **CRITICAL CLIENT-TRUSTED RNG & MATERIAL EXPLOIT:** `rpc_enchant_equipment` (`server-rs/src/meta/engine.rs:960-977`) accepts `rollBps`, `isBlessed`, and `hasProtectionStone` directly from the client's JSON request without verifying or consuming scrolls/stones from `inventory.stackables`! Any client can pass `{"instanceId":"...","rollBps":0}` to guarantee 100% success all the way to `+20` for free.
    2. **Broken item survives in inventory & crystals are discarded:** On `EnchantOutcome::FailedBrokenCrystalized { crystals_yielded }`, `rpc_enchant_equipment` (`server-rs/src/meta/engine.rs:1006-1031`) merely sets `tier: 0` in the `"item_enchant"` document; it **never removes** `instance_id` from `inventory.uniques` or `equipment.slots`, and **never credits** `crystals_yielded` to `inventory.stackables`!
    3. **Not hydrated into live `AtlasSimulation` avatars:** `get_loadout_direct` (`server-rs/src/meta/engine.rs:372-426`) and `spawn_player_avatar_with_loadout` (`server-rs/src/simulation.rs:1361,1388-1419`) never read the equipped weapon/armor's `"item_enchant"` state, so `compute_enchant_stat_multipliers` is never applied to live `Health`/`CombatStats` and `WeaponGlowComponent` defaults to `EnchantVisualGlow::None` on every spawned player.
- **Content Data (`content/` & `content/studio/world_history_and_concept.json`):**
  - `content/studio/world_history_and_concept.json:687-703` (`blacksmith_clan.forging_systems`: Equipment Refinement), `905`, `1096`, `1134`. However, `contracts/content/items.json:1-65` and `server-rs/src/content/item_catalog.rs:57-190` do not yet define scroll/protection-stone/crystal item IDs (`scroll_enchant_weapon`, `blessed_scroll_enchant_weapon`, `protection_stone`, `enchant_crystal`).
- **React Client Exposure (`client/react-client/src`):**
  - Partial: `client/react-client/src/protocol/BinaryDeltaDecoder.ts:8,41,104` decodes `enchantGlow: EnchantVisualGlow` from FlatBuffers snapshots, and `client/react-client/src/renderers/playerRenderer.ts:218-379,445-454` (`drawWeaponEnchantGlow`) renders all 5 glow tiers (`FaintWhite` through `CelestialGold` with orbiting sparkles). However, there is no Blacksmith/Enchant UI modal or RPC call to `/v2/rpc/enchant_equipment` in `client/react-client/src`.
- **Sized Next Increment Spec:**
  - **goal:** Harden `rpc_enchant_equipment` in `server-rs/src/meta/engine.rs` to use server-side RNG (allowing deterministic seed/roll override only in `RpcContext.is_s2s`), consume scroll/protection-stone items, remove shattered items from `inventory.uniques` + `equipment.slots` while granting `enchant_crystal` stackables on `FailedBrokenCrystalized`, and hydrate equipped weapon `tier` + `EnchantVisualGlow` + `compute_enchant_stat_multipliers` in `get_loadout_direct` and `spawn_player_avatar_with_loadout`.
  - **acceptance:** Client-role calls to `enchant_equipment` cannot override RNG via `rollBps`; a shatter at `+10..+19` deletes the item from `inventory.uniques`/`equipment.slots` and adds `current_tier * 75` `"enchant_crystal"` to `inventory.stackables`; and spawning a player with a `+10` weapon sets `WeaponGlowComponent` to `EnchantVisualGlow::RadiantRed` and scales `CombatStats.attack_power` by `compute_enchant_stat_multipliers(10)`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test enchant_and_sockets_test`

---

### Mechanic 5: 4-Slot Card Sockets with Special Abilities
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/content/enchantment.rs:36-63,205-255` defines `SpecialAbility` (`Focus`, `Health`, `VampiricRage`, `Haste`, `Acumen`, `CriticalStun`, `Guidance`, `Evasion`) and `ItemSocketState` (`max_sockets` clamped `.min(4)` at line `233`, `socketed_card_ids`, `special_ability`, `elemental_attribute`, `elemental_attack_bonus`, `elemental_resist_bonus`).
  - `server-rs/src/meta/engine.rs:363-367,1043-1108` implements `rpc_socket_card` persisting to `"item_sockets"`.
  - `server-rs/src/content/mmorpg.rs:110-120,616-654` loads `contracts/content/cards.json` and computes `compute_card_and_handbook_bonuses`.
  - **Tests:** `server-rs/tests/enchant_and_sockets_test.rs:108-140`, unit tests in `server-rs/src/content/enchantment.rs:331-347` and `server-rs/src/content/mmorpg.rs:1082-1097`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - `[RO/L2 Reference Knowledge + Codebase Gap]` In RO, weapons have up to 4 card slots (`[4]`) where compounding monster cards consumes the card from inventory, validates target equipment slot (`weapon` vs `armor` vs `headgear` vs `accessory`), and stacks percentage/flat combat modifiers (`+20% damage vs Demi-Human`, `+9% crit`, on-hit status procs). In L2, weapons also receive a Soul Crystal `SpecialAbility` (`Focus`, `Haste`, `Acumen`, `VampiricRage`, `CriticalStun`) and elemental attribute stones (`Fire`/`Water`/`Wind`/`Earth`/`Holy`/`Dark`).
  - In `server-rs`:
    1. **Default socket cap is 3 instead of 4 in `rpc_socket_card`:** `server-rs/src/meta/engine.rs:1074` initializes new items with `ItemSocketState::with_max_sockets(3)` instead of `4` (while `ItemSocketState::default()` at `enchantment.rs:219` is `2`).
    2. **No card ownership, catalog, or slot compatibility validation:** `rpc_socket_card` (`server-rs/src/meta/engine.rs:1043-1108`) accepts any arbitrary string as `cardId`, never checks if `cardId` exists in `MMORPG_CATALOG.cards`, never checks whether the card's `slot` matches the target item (`enchant_and_sockets_test.rs:134` sockets an armor card `"card_orc_warlord"` into `"basic_sword"`!), and never consumes the card from `inventory.stackables`.
    3. **No RPC for `SpecialAbility` or `imbue_element`, and zero combat wiring:** Neither `bestow_special_ability` nor `imbue_element` is exposed via RPC, and `get_loadout_direct` / `spawn_player_avatar_with_loadout` / `combat_system` never read `"item_sockets"` to apply card stats or `SpecialAbility` effects (`VampiricRage` 6% HP leech, `CriticalStun` 8% stun on crit, `Focus`, `Haste`, `Acumen`).
- **Content Data (`content/` & `content/studio/world_history_and_concept.json`):**
  - `contracts/content/cards.json:1-38` defines 4 cards (`card_forest_slime`, `card_boar`, `card_skeleton_soldier`, `card_orc_warlord`); `contracts/content/mobs.json:23,48,72,96` links each mob to its `cardId`; `content/studio/world_history_and_concept.json:694,755,771,1004,1134,1263` defines Monster Cards, MVP God-Apostle Cards, and Boss-Core Socketed Weapons.
- **React Client Exposure (`client/react-client/src`):**
  - Missing: `not found (searched: socket_card, socketedCardIds, SpecialAbility, cards.json in client/react-client/src)`.
- **Sized Next Increment Spec:**
  - **goal:** Update `rpc_socket_card` to support 4 sockets (`with_max_sockets(4)`), validate `cardId` against `MMORPG_CATALOG.cards` and item slot compatibility, consume 1 card from `inventory.stackables`, add `bestow_special_ability` RPC, and apply socketed card bonuses + `SpecialAbility` modifiers to `LoadoutSnapshot` and live `AtlasSimulation` combat.
  - **acceptance:** Socketing 4 valid weapon cards into a 4-slot weapon consumes the cards from inventory and increases avatar stats in `AtlasSimulation`; attempting a 5th card or socketing an armor card into a weapon returns `INVALID_ARGUMENT`; and `SpecialAbility::VampiricRage` leeches 6% of melee damage dealt as HP in `combat_system`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test enchant_and_sockets_test`

---

### Mechanic 6: 24 Standard Buff Slots + 12 Song/Dance Slots
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/combat/buffs.rs:4-217` defines `MAX_STANDARD_BUFF_SLOTS = 24`, `MAX_SONG_DANCE_SLOTS = 12`, `BuffCategory` (`Offensive`, `Defensive`, `Utility`, `SongDance`, `Debuff`), `ActiveBuff`, `BuffContainer`, `BuffStatMultipliers`, and `AuraEmitter`.
  - `server-rs/src/systems/combat.rs:430-466` implements `buff_and_aura_tick_system`, which is registered in `AtlasSimulation::new` (`server-rs/src/simulation.rs:195`), ticks buff durations, and pulses `AuraEmitter` buffs to nearby allies.
  - **Tests:** `server-rs/tests/combat_buffs_and_auras_test.rs:5-103`, `server-rs/tests/aura_spatial_bench_test.rs:11-246`, and unit tests in `server-rs/src/combat/buffs.rs:219-278`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - `[RO/L2 Reference Knowledge + Codebase Gap]` In Lineage II, all standard buffs (`Offensive`, `Defensive`, `Utility`) share a single 24-slot pool while `Song/Dance` buffs share a separate 12-slot pool (and `Debuffs` have their own separate bar); applying a new buff when the 24-slot or 12-slot pool is full **overwrites the oldest buff (FIFO eviction)** rather than failing, and active buffs immediately multiply character P.Atk, M.Atk, P.Def, M.Def, ASPD, Cast Speed, Move Speed, and Crit Rate in combat.
  - In `server-rs`:
    1. **Per-category slot counting bug (allows 72 standard buffs instead of 24):** `BuffContainer::apply_buff` (`server-rs/src/combat/buffs.rs:130-143`) counts `self.buffs.iter().filter(|b| b.category == new_buff.category).count()`, which caps *each* `BuffCategory` variant at 24 independently (24 `Offensive` + 24 `Defensive` + 24 `Utility` = 72 standard buffs, plus 24 `Debuff`s!).
    2. **Rejects new buffs instead of FIFO eviction & misses `cast_time_mult` on refresh:** When a pool hits capacity, `apply_buff` (`server-rs/src/combat/buffs.rs:141-143`) returns `false` instead of evicting the oldest buff in that pool, and refreshing an existing buff (`buffs.rs:117-126`) updates `p_atk_mult..aspd_mult` but forgets `existing.cast_time_mult = new_buff.cast_time_mult`.
    3. **Multipliers never read by combat, movement, or casting systems:** `BuffContainer::aggregate_multipliers()` (`server-rs/src/combat/buffs.rs:173-189`) is never queried in `player_input_system` (`server-rs/src/systems/player_input.rs:13-117`), `combat_system` (`server-rs/src/systems/combat.rs:78-295`), `projectile_collision_system` (`server-rs/src/systems/projectile.rs:33-562`), or `skill_execution_system` (`server-rs/src/systems/skill_execution.rs:31-343`)!
- **Content Data (`content/` & `content/studio/world_history_and_concept.json`):**
  - `content/studio/world_history_and_concept.json:929,1005,1078,1116,1238,1270` defines party buff skills (`Blessing`, `Increase AGI`, `Overthrust Party Buff`, `Synchronized Party Auras`).
- **React Client Exposure (`client/react-client/src`):**
  - Minimal: `client/react-client/src/renderers/playerRenderer.ts:557-583` and `client/react-client/src/components/EntityCard.tsx:148-174` render `freeze`/`stun` from `battleStatuses`, but `BuffContainer` (24 standard + 12 song/dance buffs) is neither serialized on the FlatBuffers wire nor shown in a HUD buff bar.
- **Sized Next Increment Spec:**
  - **goal:** Fix `BuffContainer::apply_buff` (`server-rs/src/combat/buffs.rs:115-147`) to pool `Offensive | Defensive | Utility` into a shared 24-slot cap with FIFO eviction (and `SongDance` into a 12-slot FIFO pool, `Debuff` into its own pool), update `cast_time_mult` on refresh, and apply `BuffContainer::aggregate_multipliers()` in `player_input_system`, `combat_system`, `projectile_collision_system`, and `skill_execution_system`.
  - **acceptance:** Applying 8 `Offensive`, 8 `Defensive`, and 8 `Utility` buffs fills all 24 standard slots; applying a 25th standard buff evicts the 1st buff (FIFO) while leaving 12 `SongDance` slots untouched; and an active `Chant of Victory` (`p_atk_mult: 1.20`, `move_speed_mult: 1.15`) increases live melee damage by 20% and movement speed by 15%.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test combat_buffs_and_auras_test --test aura_spatial_bench_test`

---

### Mechanic 7: Spatial Portal Triggers (Bevy ECS)
- **Status:** `partial` (ECS spatial detection is complete; runtime transition has edge-case bugs and lacks overworld-to-overworld warps)
- **Server & Test Evidence:**
  - `server-rs/src/ecs/components.rs:31-57,79-91` defines `DungeonPortalTrigger`, `DungeonPortalEntryEvent`, and `DungeonPortalEventQueue`.
  - `server-rs/src/systems/portal.rs:9-62` implements `dungeon_portal_trigger_system` (checks `health.is_alive`, `player_level >= trigger.min_level`, `dist_sq <= trigger_radius * trigger_radius`, deduplicates per tick).
  - `server-rs/src/simulation.rs:211,362-374,1070,1435-1442` registers `dungeon_portal_trigger_system` in the live schedule, spawns `DungeonPortalTrigger` entities from `map_cfg.dungeon_portals`, and drains `DungeonPortalEventQueue` into `LiveFrame.dungeon_portal_events`.
  - `server-rs/src/main.rs:432-452` processes `frame.dungeon_portal_events` in the server tick loop.
  - **Tests:** `server-rs/tests/dungeon_spire_and_catalog_test.rs:42-93`, `server-rs/tests/dungeon_gateway_allocation_test.rs:9-68`, and unit tests in `server-rs/src/systems/portal.rs:64-114`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - `[RO/L2 Reference Knowledge + Codebase Gap]` In RO, spatial warp portals connect both overworld zones (town-to-field, field-to-field) and dungeon floors, immediately relocating the character's entity out of the source zone so they do not re-trigger the portal on the next tick.
  - In `server-rs`:
    1. **Infinite 20Hz re-allocation loop when standing on a portal:** When a player steps into a `DungeonPortalTrigger`, `main.rs:432-452` calls `handle_dungeon_portal_entry` (which changes the player's WebSocket `session_rooms` mapping in `net/ws.rs:620`), **but never despawns or moves the player's ECS entity in the source `AtlasSimulation` room!** On the very next 50ms tick, `dungeon_portal_trigger_system` sees the same player still standing at `(portal_x, portal_y)` and fires `DungeonPortalEntryEvent` again, allocating 20 new dungeon instances per second!
    2. **Solo-only party resolution on trigger:** `main.rs:437-449` fabricates `party_id = format!("party_{}", entry.player_id)` and passes `&[entry.player_id.clone()]` instead of looking up the player's actual party in `SocialHub`.
    3. **No overworld-to-overworld warp portal triggers:** `DungeonPortalTrigger` only allocates instanced dungeons; the 64 overland node portal chains in `content/studio/world_history_and_concept.json:1305-1680` are not spawned as overworld region-transfer triggers.
- **Content Data (`content/` & `content/studio/world_history_and_concept.json`):**
  - `content/dungeons/catalog.json` defines 60 dungeon portal coordinates (`portal_x`, `portal_y`, `portal_radius`, `level_min`); `content/maps/*.json` defines map `portals`; `content/studio/world_history_and_concept.json:1305-1680` defines all 6 racial spoke portal chains and 3 continental mainline portal chains.
- **React Client Exposure (`client/react-client/src`):**
  - Missing on canvas: `DungeonPortalTrigger` entities are not included in FlatBuffers `WorldSnapshot` (`server-rs/src/simulation.rs:1076-1221`) and are not drawn on the canvas in `client/react-client/src/renderers/mapRenderer.ts`.
- **Sized Next Increment Spec:**
  - **goal:** Despawn/extract the triggering player (and their in-range party members from `SocialHub`) from the source `AtlasSimulation` room upon `DungeonPortalEntryEvent` in `server-rs/src/main.rs:432-452` (or add a per-player portal transfer cooldown/lock), and record `set_instance_origin` with the source region ID and portal coordinates.
  - **acceptance:** A player stepping onto a `DungeonPortalTrigger` in `millcross-ford` triggers exactly 1 dungeon allocation across 20 consecutive ticks, records `origin_region_id = Some("millcross-ford")`, and removes the player entity from the `millcross-ford` overworld simulation.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test dungeon_spire_and_catalog_test --test dungeon_gateway_allocation_test`

---

### Mechanic 8: Agones Match Allocation
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/fleet/agones.rs:11-318` implements `FleetState` (`Init`, `Ready`, `Allocated`, `Shutdown`), `FleetLifecycle`, `MockFleetClient`, `AgonesClient` (HTTP POST to local Agones SDK sidecar `127.0.0.1:9358` `/ready`, `/health`, `/allocate`, `/shutdown` with 500ms timeout and mock state fallback), and `HeartbeatTask`.
  - `server-rs/src/main.rs:222-230,611-616` calls `agones.ready()`, starts `HeartbeatTask`, and calls `agones.shutdown()` on exit.
  - `server-rs/src/net/ws.rs:602-616,1914-1917` calls `agones.allocate()` when a dungeon portal is entered.
  - **Tests:** `server-rs/tests/fleet_and_auth.rs:12-42,122-142`, `server-rs/tests/dungeon_gateway_allocation_test.rs:9-68,124-126`, and unit tests in `server-rs/src/fleet/agones.rs:320-402`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - `[RO/L2 Reference Knowledge + Codebase Gap]` In an Agones-backed MMORPG architecture (or RO/L2 multi-zone server cluster), when an overworld zone server allocates an instanced dungeon (or when all dungeon instances on a pod finish), the lifecycle must either: (a) return the pod to `Ready` (or `Shutdown` a dedicated instance pod) when the last dungeon instance in `DungeonRegistry` is cleared/expired/abandoned, and (b) expose allocation metadata (labels/annotations for `instance_id` / `party_id`) or remote `GameServerAllocation` endpoint routing.
  - In `server-rs`:
    1. **One-way `Allocated` transition — never returns to `Ready` or `Shutdown` on dungeon completion/expiry:** Once the first party enters a dungeon, `agones.allocate()` sets the server to `FleetState::Allocated` (`server-rs/src/net/ws.rs:604`), but `prune_expired_instances` (`server-rs/src/fleet/dungeons.rs:748-756`) and `trigger_dungeon_egress` (`server-rs/src/net/ws.rs:2150-2175`) never transition `AgonesClient` back to `Ready` when active dungeon count drops to `0`, nor is `prune_expired_instances` called in `main.rs`'s tick loop!
- **Content Data (`content/` & `content/studio/world_history_and_concept.json`):**
  - N/A (fleet infrastructure layer; dungeon instance TTLs and templates are in `content/dungeons/catalog.json`).
- **React Client Exposure (`client/react-client/src`):**
  - Transparent to client (`client/react-client/src/hooks/useServerRsClient.ts:1145-1199` receives `{ ok: true, instance }` from `/dungeon/portal/enter`).
- **Sized Next Increment Spec:**
  - **goal:** Wire periodic `dungeons.prune_expired_instances` into the `main.rs` tick loop and transition `AgonesClient` back to `FleetState::Ready` when the last active `DungeonInstance` in `DungeonRegistry` completes egress or expires.
  - **acceptance:** Allocating a dungeon transitions `AgonesClient` to `FleetState::Allocated`; when all players egress (or the instance TTL expires and is pruned) and `active_instance_count() == 0`, `AgonesClient` transitions back to `FleetState::Ready`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test fleet_and_auth --test dungeon_gateway_allocation_test`

---

### Mechanic 9: Boss Phases and Enrage
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/fleet/dungeons.rs:16-204,684-745` implements `BossPhase` (`Phase1Normal`, `Phase2Empowered`, `Enraged`, `Defeated`), `BossEncounterState`, `apply_damage` (at `<= 50%` HP transitions to `Phase2Empowered` with `1.35x` ATK, `1.25x` ASPD, `empowered_skill_unlocked = true`), and `tick` (at `elapsed >= enrage_timer_secs` transitions to `BossPhase::Enraged` with `4.0x` ATK, `2.0x` ASPD).
  - `server-rs/src/ecs/components.rs:61-73,291-323` defines `DungeonEncounterLink` and `BossTag` (`1.5x` visual scale, `BOSS_BODY_RADIUS = 24.0`).
  - `server-rs/src/content/bestiary.rs` & `server-rs/src/systems/mob_lifecycle.rs:59-70` scale `MobTier::Boss` by `BOSS_HP_MULTIPLIER = 3.5` and `BOSS_ATK_MULTIPLIER = 2.5`.
  - **Tests:** `server-rs/tests/dungeon_boss_encounter_test.rs:10-202`, `server-rs/tests/boss_tier_scaling_test.rs:20-118`, `server-rs/tests/dungeon_spire_and_catalog_test.rs:161-197`, and unit tests in `server-rs/src/fleet/dungeons.rs:829-911`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - `[RO/L2 Reference Knowledge + Codebase Gap]` In RO/L2, boss phases and enrage timers run directly on the live boss entity in the simulation tick loop: crossing 50% HP or enrage immediately multiplies the live boss entity's melee/projectile damage and attack speed in ECS, unlocks phase-2 AoE skills/telegraphs or follower summons, and broadcasts the boss phase/enrage state to clients in the room.
  - In `server-rs`:
    1. **`BossEncounterState` is completely disconnected from Bevy ECS combat and AI:** `DungeonEncounterLink` (`server-rs/src/ecs/components.rs:61-73`) is defined as a component, but **zero systems in `server-rs/src/systems/**` ever query `DungeonEncounterLink`!** Live ECS boss mobs (`MobTier::Boss`) do not have a `BossEncounterState`, do not transition to `Phase2Empowered` at 50% HP, do not tick an enrage timer in `AtlasSimulation::step`, and do not scale `CombatStats.attack_power` or `attack_cooldown` by `atk_multiplier` (`1.35x` / `4.0x`) or `aspd_multiplier` (`1.25x` / `2.0x`).
    2. **`empowered_skill_unlocked` has no skill behavior:** Setting `empowered_skill_unlocked = true` in `BossEncounterState` (`server-rs/src/fleet/dungeons.rs:138`) is a boolean flag only; `mob_ai_system` (`server-rs/src/systems/mob_ai.rs:58-340`) has no phase-2 skill rotation or AoE attack.
- **Content Data (`content/` & `content/studio/world_history_and_concept.json`):**
  - `content/dungeons/catalog.json` defines `mvp_boss_id`, `mvp_boss_hp`, and `boss_enrage_secs` for all 60 dungeons; `content/studio/world_history_and_concept.json:65-183,593-684,738-773` defines the strict `GOD_SEALED > MVP_GOD_SUBORDINATE > RAID_BOSS > MINI_BOSS > NORMAL_MOB` hierarchy and named MVP Apostles (`Arch-Valkyrie Caelia`, `Dread-Lord Ignisazar`, `Raijin-Vex`, `Pelagios`, `Volcanor`).
- **React Client Exposure (`client/react-client/src`):**
  - Partial (Unmounted): `client/react-client/src/components/DungeonHUD.tsx:215-395` renders `boss-encounter-card` with phase badge (`PHASE 1: NORMAL`, `PHASE 2: EMPOWERED`, `BERSERK / ENRAGED`), HP bar, enrage countdown timer, and `Empowered Skills Active` indicator. However, `ColyseusGameCanvas.tsx:57` imports `DungeonHUD` **without rendering `<DungeonHUD ... />` in JSX**, and `useServerRsClient.ts` never populates `stateRef.current.bossEncounter`!
- **Sized Next Increment Spec:**
  - **goal:** Add a `boss_encounter_sync_system` in `server-rs` that queries `DungeonEncounterLink` (and `BossTag` mobs), syncs live ECS damage (`HitLog`) and `SimClock` ticks with `BossEncounterState`, applies `atk_multiplier` and `aspd_multiplier` to the boss entity's `CombatStats`, and mount `<DungeonHUD />` in `ColyseusGameCanvas.tsx` fed by dungeon state updates.
  - **acceptance:** Dealing >50% damage to a `BossTag` entity with `DungeonEncounterLink` in `AtlasSimulation` transitions its `BossEncounterState` to `Phase2Empowered` and scales its `CombatStats.attack_power` by `1.35x` and `attack_cooldown` by `1.0 / 1.25`; ticking past `enrage_timer_secs` scales `attack_power` by `4.0x`; and `<DungeonHUD />` renders in `ColyseusGameCanvas.tsx`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test dungeon_boss_encounter_test --test boss_tier_scaling_test`

---

### Mechanic 10: RO/L2-Style Weighted MVP Reward Distribution
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/fleet/dungeons.rs:206-214,283-358,561-625,684-714` defines `PlayerDungeonContribution` (`damage_dealt`, `damage_taken`, `healing_done`, `has_first_hit`, `has_last_hit`) and `compute_mvp_rewards_from_contributions` using weighted scoring: **50% damage dealt** (`5000` pts), **20% healing done** (`2000` pts), **15% damage taken / tanking** (`1500` pts), **7.5% first hit** (`750` pts), and **7.5% last hit** (`750` pts).
  - Rank 1 receives `is_mvp_winner: true`, `reward_item_id: "mvp_crown_of_victory"`, and `bonus_exp: 25_000`; all other participants with score > 0 receive `reward_item_id: "dungeon_participant_chest"` and `bonus_exp: 8_000`.
  - **Tests:** `server-rs/tests/dungeon_boss_encounter_test.rs:86-104,198-202`, `server-rs/tests/dungeon_wipe_and_mvp_healing_test.rs:8-68`, and `server-rs/tests/dungeon_spire_and_catalog_test.rs:186-192`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - `[RO/L2 Reference Knowledge + Codebase Gap]` In Ragnarok Online, defeating an MVP boss displays the overhead `MVP!` banner above the top-scoring player, directly grants bonus MVP EXP and deposits the MVP prize item into the winner's inventory (or drops priority-locked MVP loot), and tracks both dungeon and field MVPs.
  - In `server-rs`:
    1. **Rewards are computed on paper only — never granted to players or persisted:** When a boss reaches 0 HP (`server-rs/src/fleet/dungeons.rs:703-707`), `compute_mvp_rewards_from_contributions` populates `BossEncounterState.mvp_rewards`, but **nothing ever credits `bonus_exp` or `reward_item_id` to `PlayerProgression` / `PlayerInventory` in ECS or invokes `RustMetaEngine` (`grant_xp` / `grant_loot`)!**
    2. **Reward items missing from catalogs:** Neither `"mvp_crown_of_victory"` nor `"dungeon_participant_chest"` exists in `ItemCatalog` (`server-rs/src/content/item_catalog.rs:57-190`) or `contracts/content/items.json:1-65` (`grant_loot` rejects unknown item IDs at `server-rs/src/meta/engine.rs:771-775`).
    3. **Live ECS combat and healing never record contributions:** `combat_system`, `projectile_collision_system`, and `skill_execution_system` never call `DungeonRegistry::record_boss_damage` or `record_healing`, and there is no HTTP endpoint for `record_healing`.
- **Content Data (`content/` & `content/studio/world_history_and_concept.json`):**
  - `content/studio/world_history_and_concept.json:750-756` defines `mvp_boss` loot tier (`MVP God-Apostle Cards, Divine Weapon Cores, and Crown Cosmetics`); `contracts/content/mobs.json:76-98` defines `orc_warlord` with `"isMvp": true`.
- **React Client Exposure (`client/react-client/src`):**
  - Missing: `not found (searched: mvpRewards, isMvpWinner, mvp_crown_of_victory in client/react-client/src)`. `DungeonHUD.tsx:397-463` shows a generic `"Dungeon Cleared"` card on `phase === "defeated"` without displaying the MVP winner rankings or rewards.
- **Sized Next Increment Spec:**
  - **goal:** Register `"mvp_crown_of_victory"` and `"dungeon_participant_chest"` in `ItemCatalog` and `contracts/content/items.json`, feed live ECS boss damage/tanking/healing into `PlayerDungeonContribution`, and grant `MvpRewardAllocation` (`bonus_exp` + `reward_item_id`) idempotently to `PlayerProgression`/`PlayerInventory` (and `RustMetaEngine` when configured) upon `BossDefeated`.
  - **acceptance:** When a party defeats a boss, the rank-1 MVP winner's `PlayerProgression.total_xp` increases by `25_000` and their `PlayerInventory` (and persistent `InventoryDoc`) receives `"mvp_crown_of_victory"`, while rank 2+ participants receive `8_000` XP and `"dungeon_participant_chest"`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test dungeon_boss_encounter_test --test dungeon_wipe_and_mvp_healing_test`


---

### 3.11 Cast Interruption by Direct Damage
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/ecs/components.rs:183-214` — `CastingState { skill_id, casting_until, uninterruptible }` with `is_casting()`, `start_cast()`, and `finish_or_cancel()`.
  - `server-rs/src/systems/combat.rs:240-244` — inside melee `combat_system`, after direct damage is applied to a target, queries `Option<&mut CastingState>` and calls `if !casting.uninterruptible { casting.finish_or_cancel(); }`.
  - `server-rs/src/systems/skill_execution.rs:47-51` — inside `skill_execution_system`, cancels active cast if `!health.is_alive`.
  - `server-rs/src/systems/projectile.rs:33-562` — `projectile_collision_system` (does **not** query or cancel `CastingState`).
  - `server-rs/tests/cast_interruption_test.rs:1-98` — tests interruptible cast cancellation on melee hit, uninterruptible cast preservation, and death cancellation.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - **[RO/L2 Reference Knowledge]:** In *Ragnarok Online*, any direct damage hit (melee auto-attack, ranged arrow/bullet projectile, or single-target/AoE direct damage spell) immediately interrupts variable spell casting unless the caster has *Phen Card* / *Orleans's Gown* (`uninterruptible`, +15–25% cast time penalty) or is under `Endure` (blocks hitlock/flinch for up to 7 hits). In *Lineage II*, direct damage rolls an interruption chance scaled by damage-to-max-HP vs. the caster's Concentration / `WIT`, and hard CC (`Stun`, `Fear`, `Knockback`, `Silence`) unconditionally aborts active casts.
  - **[Codebase Gap]:**
    1. **Mobs and ranged/skill hits never interrupt casting in live simulation rooms:** `combat_system` (`server-rs/src/systems/combat.rs:78-84`) explicitly skips entities with `MobAi` or `ProjectileWeapon`. In live rooms, all mobs (`mob_ai_system` at `server-rs/src/systems/mob_ai.rs:103-120,308-336`), ranged player auto-attacks, and projectile/AoE skills deal damage via `projectile_collision_system` (`server-rs/src/systems/projectile.rs:33-562`) or `lingering_zone_system` (`server-rs/src/systems/skill_execution.rs:345-430`), **neither of which queries or cancels `CastingState`**.
    2. **Crowd control (`Stun` / `Knockback`) does not cancel `CastingState`:** Applying `StatusEffects::stun_until` in `server-rs/src/systems/skill_execution.rs:254-308` leaves `CastingState` running.
    3. **No wire synchronization of cast state / interruption:** `CastingState` is not included in FlatBuffers `EntityDelta` (`server-rs/src/simulation.rs:1076-1221`), so when the server cancels a cast, the React client's local cast bar continues running until completion.
- **Content Data:**
  - `contracts/content/skills.json:1-99` (skill definitions); `content/studio/world_history_and_concept.json:1265` (`Swordman: Magnum Break & Endure`).
- **React Client Exposure:**
  - **Partial (Local Timer Only):** `client/react-client/src/components/ColyseusGameCanvas.tsx:282-300,439-442` and `client/react-client/src/renderers/playerRenderer.ts:498-522` render a client-predicted cast bar (`localCastRef`), only clearing it on player death (`if (isDead) setActiveCast(null)` at `client/react-client/src/components/ColyseusGameCanvas.tsx:441`).
- **Sized Next Increment:**
  - **goal:** Interrupt `CastingState` (when `!uninterruptible` and no `Endure` / Phen buff is active) across all direct-damage paths (`projectile_collision_system`, `lingering_zone_system`, `skill_execution_system`) and hard CC (`Stun`/`Knockback`), and emit cast interruption state to clients so the cast bar aborts immediately.
  - **acceptance:** A ranged mob projectile hit, direct-damage skill hit, or stun effect in `AtlasSimulation` cancels an interruptible `CastingState` while preserving casts guarded by `uninterruptible` or `card_phen_uninterruptible_cast`, verified by integration tests in `server-rs/tests/cast_interruption_test.rs`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test cast_interruption_test`

---

### 3.12 Boss Wipe = 100% Reset
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/fleet/dungeons.rs:191-203` — `BossEncounterState::reset_on_wipe(now_secs)` restores `current_hp = max_hp`, `phase = BossPhase::Phase1Normal`, `is_enraged = false`, `atk_multiplier = 1.0`, `aspd_multiplier = 1.0`, `empowered_skill_unlocked = false`, `mvp_rewards = None`, and `encounter_start_secs = now_secs`.
  - `server-rs/src/fleet/dungeons.rs:627-646` — `DungeonRegistry::check_party_wipe(instance_id, alive_party_members, now_secs)` triggers `boss.reset_on_wipe(now_secs)` and sets `inst.state = DungeonState::Failed` when `alive_party_members == 0`.
  - `server-rs/tests/dungeon_wipe_and_mvp_healing_test.rs:71-108` — `boss_resets_to_100_percent_and_phase_1_on_party_wipe`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - **[RO/L2 Reference Knowledge]:** In *Lineage II* / *Ragnarok Online* instanced raids, when all party members in the boss room die or leash out, the boss resets to 100% HP, Phase 1, and its home spawn position, clears all aggro (`ThreatTable`), clears all player MVP contribution counters from the failed pull, and remains fightable when the party re-enters or respawns at the dungeon entrance before the instance TTL expires.
  - **[Codebase Gap]:**
    1. **Contribution ledger is not cleared on wipe:** `DungeonRegistry::check_party_wipe` (`server-rs/src/fleet/dungeons.rs:627-646`) calls `boss.reset_on_wipe(now_secs)` but leaves `inst.contributions` intact, so damage dealt, healing done, and first-hit bonuses from failed pulls accumulate into subsequent pulls.
    2. **`DungeonState::Failed` permanently bricks the instance:** Setting `inst.state = DungeonState::Failed` (`server-rs/src/fleet/dungeons.rs:641`) blocks `record_floor_mob_kills` and `advance_floor` (`server-rs/src/fleet/dungeons.rs:517,564` check `inst.state == DungeonState::Active`), with no re-activation transition when players respawn and re-engage.
    3. **Not wired to live ECS player deaths:** Neither `player_respawn_system` (`server-rs/src/systems/live.rs:287-336`) nor `combat_system` checks whether `alive_party_members == 0` in a dungeon room to invoke `check_party_wipe` and reset the live ECS boss entity's `Health`, `ThreatTable`, and `Position`.
- **Content Data:**
  - `content/dungeons/catalog.json:1-900` (`mvp_boss_hp`, `boss_enrage_secs`).
- **React Client Exposure:**
  - `not found (searched: PartyWipe, check_party_wipe, boss reset in client/react-client/src)`.
- **Sized Next Increment:**
  - **goal:** Clear `inst.contributions` on `check_party_wipe`, keep the instance fightable (`DungeonState::Active` until TTL expiration), and wire an ECS dungeon wipe check that resets both `BossEncounterState` and the live ECS boss entity (`Health`, `ThreatTable`, `Position`) when all players in the instance are dead.
  - **acceptance:** Wiping on a boss clears `inst.contributions`, restores boss HP to 100% and Phase 1 in both `DungeonRegistry` and the ECS world, and allows the party to re-engage and defeat the boss on a fresh pull with clean MVP weights.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test dungeon_wipe_and_mvp_healing_test`

---

### 3.13 Seamless Overworld <-> Instanced Dungeon Entry/Egress
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/systems/portal.rs:9-62` — `portal_trigger_system` emits `PortalTransitionEvent`.
  - `server-rs/src/main.rs:432-452` — simulation loop drains `PortalTransitionEvent` and invokes `net::ws::handle_dungeon_portal_entry(&state, &ev.player_id, &ev.destination_dungeon_id)`.
  - `server-rs/src/net/ws.rs:573-628` — `handle_dungeon_portal_entry` allocates an instance in `DungeonRegistry`, updates `SessionAssignment.region_id = instance_id`, moves the player's WebSocket broadcaster to `instance_id`, and sends `DungeonInstanceAllocated`.
  - `server-rs/src/net/ws.rs:1826-1938,2135-2200` — HTTP endpoints `/dungeons/enter`, `/dungeons/instance/{id}`, `/dungeons/advance-floor`, `/dungeons/egress`.
  - `server-rs/src/fleet/dungeons.rs:593-608,652-681` — `set_instance_origin` and `egress_to_overworld`.
  - `server-rs/tests/dungeon_gateway_allocation_test.rs:9-180`, `server-rs/tests/dungeon_egress_test.rs:4-92`, `server-rs/tests/dungeon_spire_and_catalog_test.rs:42-197`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - **[RO/L2 Reference Knowledge]:** In *Ragnarok Online* (Memorial Dungeons) and *Lineage II* (Kamaloka / Seven Signs Catacombs), entering a dungeon portal transfers the party into an active simulation room for that dungeon instance (spawning the floor's monsters and MVP boss), and stepping into the exit portal after boss defeat seamlessly returns each player to their exact pre-entry overworld region and coordinates.
  - **[Codebase Gap]:**
    1. **No `AtlasSimulation` room is created for `instance_id`:** In `server-rs/src/main.rs:252-339,411-463`, `rooms` is a static `HashMap<String, AtlasSimulation>` initialized once at startup for overworld regions (`town-millcross`, `zone-1`..`zone-4`, etc.). When `handle_dungeon_portal_entry` (`server-rs/src/net/ws.rs:573-628`) reassigns a player's session and WebSocket to `instance_id` (e.g., `dng_inst_1`), **no `AtlasSimulation` exists for `dng_inst_1`**, so the player's avatar remains stuck in the overworld ECS world while their WebSocket stops receiving any FlatBuffers world snapshots!
    2. **Portal entry ignores `DungeonCatalog` and overworld origin:** `handle_dungeon_portal_entry` (`server-rs/src/net/ws.rs:593-595`) hardcodes `allocate_or_join_party(&party_id, dungeon_id, 50_000, 300, now_secs)` instead of calling `allocate_from_catalog`, and never records `set_instance_origin(instance_id, &prev_region_id, player_pos.x, player_pos.z)`.
    3. **HTTP `/dungeons/egress` does not move the live WebSocket or ECS avatar back:** `dungeon_egress_handler` (`server-rs/src/net/ws.rs:2135-2200`) updates `SessionAssignment` and returns JSON, but does not move the player's WebSocket subscription back to `return_region_id` or respawn their avatar at `(return_x, return_z)` in the overworld `AtlasSimulation`.
- **Content Data:**
  - `content/dungeons/catalog.json:1-900` (60 canonical dungeons across 6 continents); `content/studio/world_history_and_concept.json:799-805,822-826,843-847,1441-1490`.
- **React Client Exposure:**
  - **Partial:** `client/react-client/src/hooks/useServerRsClient.ts:1145-1295` (`enterDungeon`, `advanceDungeonFloor`, `egressDungeon`) and `client/react-client/src/components/DungeonHUD.tsx:46-213,397-463`. However, `DungeonHUD` is imported in `client/react-client/src/components/ColyseusGameCanvas.tsx:57` without being mounted in JSX, and `useServerRsClient.ts:1171-1178` populates `floorCleared`/`portalActive` while `DungeonHUD.tsx:86,145,169` reads `bossFloor`/`gateUnlocked`.
- **Sized Next Increment:**
  - **goal:** Dynamically spawn and tick an instanced `AtlasSimulation` per active `DungeonInstance` (populated from `DungeonCatalog`), record the player's pre-entry overworld `(region_id, x, z)` via `set_instance_origin`, transfer the player's ECS avatar + WebSocket into the dungeon simulation on entry, and transfer both back to `(return_region_id, return_x, return_z)` on egress.
  - **acceptance:** Stepping onto a `DungeonPortal` transfers the player into a live ticking `AtlasSimulation` for `instance_id` with catalog-driven floor mobs and boss, and calling `/dungeons/egress` (or stepping onto the exit portal) restores the player's avatar and WebSocket stream to their exact overworld origin coordinates.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test dungeon_gateway_allocation_test --test dungeon_egress_test --test dungeon_spire_and_catalog_test`

---

### 3.14 Parties, Friends, Chat
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/systems/social.rs:16-700`:
    - Constants: `MAX_CHAT_MESSAGES_PER_SECOND = 5` (line `17`), `NEARBY_CHAT_RADIUS = 50.0` (line `20`), `PARTY_SHARE_RADIUS = 300.0` (line `23`).
    - Components & Resources: `ChatChannel` (`Nearby`, `World`, `Party`, lines `26-31`), `SocialSession` (lines `44-50`), `ChatInbox` (lines `53-59`), `ChatRateLimiter` (lines `62-88`), `SocialHub` (`friend_requests_to`, `friends_of`, `parties`, `player_party`, `party_invites_to`, `next_party_seq`, lines `111-125`).
    - Systems & Functions: `send_chat_message` (lines `144-224`), `send_friend_request` / `accept_friend_request` / `remove_friend` / `list_friends_with_presence` (lines `228-334`), `create_party` / `invite_to_party` / `accept_party_invite` / `get_party_roster` / `sync_party_member_snapshots` (lines `338-484`), `grant_party_kill_rewards` (lines `488-619`), `locate_friend_in_world` / `join_friend_in_world` (lines `623-699`).
  - `server-rs/tests/nearby_and_world_chat_test.rs:10-128`, `server-rs/tests/friends_list_test.rs:9-57`, `server-rs/tests/parties_test.rs:12-110`, `server-rs/tests/find_and_join_friends_test.rs:11-78`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - **[RO/L2 Reference Knowledge]:** In *Ragnarok Online* and *Lineage II*, players form parties (up to 9 in L2 / 12 in RO) with configurable EXP share (`Each Take` vs. `Even Share` within a 15-level band granting +10–20% bonus XP per member) and item distribution (`Finders Keepers`, `Random`, `Order`), manage party lifecycle (`leave`, `kick`, `promote_leader`, `disband`), maintain persistent friend lists across sessions, and communicate via `Nearby`, `Party`, `Guild`, `World`, and `Whisper` chat channels over the live socket.
  - **[Codebase Gap]:**
    1. **Zero network/RPC/WebSocket wiring:** `SocialHub` is never inserted in `AtlasSimulation::new` (`server-rs/src/simulation.rs:148-220`), `sync_party_member_snapshots` is not in the schedule, `RustMetaEngine::invoke_rpc` (`server-rs/src/meta/engine.rs:291-370`) exposes zero social/party/friend/chat RPCs, and `server-rs/src/net/ws.rs:1468` ignores incoming `Message::Text` frames.
    2. **Live kills never share XP or loot with party members:** `experience_on_kill_system` (`server-rs/src/systems/progression.rs:79-126`) awards XP solely to `killer_entity` and never calls `grant_party_kill_rewards` (`server-rs/src/systems/social.rs:488-619`).
    3. **Missing party management & persistence:** `SocialHub` lacks `leave_party`, `kick_party_member`, `disband_party`, max party size cap (`6` per studio spec), party bonus XP per member, `Whisper`/`Guild` chat channels, and friend list persistence in `MetaDocStore`.
- **Content Data:**
  - `content/studio/world_history_and_concept.json:704-714,775-849,1216,1426-1434` (6-player cross-race party matchmaking & Accord Guild Registration at `town-kilnwatch-bastion`).
- **React Client Exposure:**
  - `not found (searched: send_chat_message, create_party, send_friend_request, ChatChannel in client/react-client/src)` — only a hardcoded `partyId = "party_solo"` default parameter exists in `client/react-client/src/hooks/useServerRsClient.ts:1148`.
- **Sized Next Increment:**
  - **goal:** Insert `SocialHub` into `AtlasSimulation` and shared `AppState`, wire WebSocket/RPC handlers for chat (`Nearby`/`Party`/`World`/`Whisper`), friends (`request`/`accept`/`remove`/`list`/`join`), and parties (`create`/`invite`/`accept`/`leave`/`kick` with max 6 members), and invoke `grant_party_kill_rewards` from `experience_on_kill_system`.
  - **acceptance:** Two connected players can form a party over RPC/WS, exchange `Nearby`/`Party`/`World` chat messages over WebSocket, see live party HP/position snapshots, and receive shared XP/gold when a party member kills a mob within `PARTY_SHARE_RADIUS`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test nearby_and_world_chat_test --test friends_list_test --test parties_test --test find_and_join_friends_test`

---

### 3.15 Quests
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/systems/progression.rs:554-767` — ECS runtime quest engine (`RuntimeQuestCatalog::load_default` reading `content/story/quests.json`, `PlayerQuestTracker::accept_quest`, `record_objective_progress`, `claim_quest_reward` granting XP, gold, and items).
  - `server-rs/src/meta/engine.rs:348-357,501-700,1277-1456` — persistent Meta Engine `accept_quest` and `claim_quest_reward` RPCs (`POST /v2/rpc/accept_quest`, `POST /v2/rpc/claim_quest_reward`) plus `report_match_events` advancing quest progress on `MOB_KILLED`, `ITEM_PICKED_UP`, and `ZONE_ENTERED`.
  - `server-rs/src/content/mmorpg.rs:140-181,252-253` — `QuestBoardCatalog` loading `contracts/content/quest_board.json`.
  - `server-rs/tests/quests_at_runtime_test.rs:10-108`, `server-rs/tests/rust_meta_engine.rs:225-234`, `server-rs/tests/nakama_persistence.rs`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - **[RO/L2 Reference Knowledge]:** In *Ragnarok Online* and *Lineage II*, players accept Main Story, Job Change (Lv.10 1st class trial, Lv.40 2nd class promotion), and Repeatable Bounty/Side Quests from NPCs; killing mobs, collecting drops, and visiting landmarks in live rooms automatically updates persistent quest progress, and turning in a job quest promotes the character's class (`Novice -> Swordman -> Knight`).
  - **[Codebase Gap]:**
    1. **Three fragmented, unmerged quest catalogs:**
       - `MetaCatalogs` (`server-rs/src/meta/catalogs.rs:54-65`) only loads `contracts/content/quests.json` (3 synthetic test quests: `q_boar_5`, `q_gather_ore`, `q_explore_forest`). Calling `POST /v2/rpc/accept_quest` for any of the **28 authored story quests** in `content/story/quests.json` or the **8 class/story/bounty quests** in `contracts/content/quest_board.json` fails with `QUEST_NOT_FOUND`!
       - `RuntimeQuestCatalog` (`server-rs/src/systems/progression.rs:621-697`) loads `content/story/quests.json`, but is never inserted into `AtlasSimulation::new`.
       - `QuestBoardCatalog` (`server-rs/src/content/mmorpg.rs:140-181`) loads `contracts/content/quest_board.json` (including `jq_swordman_trial`, `jq_mage_academy`, `jq_archer_range`, `jq_acolyte_sanctuary`), but has no execution hooks.
    2. **Missing `ITEM_PICKED_UP` and `ZONE_ENTERED` match events in live ECS:** `combat_system` (`server-rs/src/systems/combat.rs:285-293`) pushes `MatchEvent::mob_kill`, but `loot_pickup_system` never emits `ITEM_PICKED_UP` and zone transitions never emit `ZONE_ENTERED`.
    3. **Job-change quest completion does not promote character class:** Claiming `jq_swordman_trial` does not transition the player's job class or unlock class skills.
- **Content Data:**
  - `content/story/quests.json:1-726` (28 story quests); `contracts/content/quests.json:1-32` (3 test quests); `contracts/content/quest_board.json:1-173` (8 quests across `main_story`, `job_change`, `side_story`, `bounty_board` with prerequisite chains and class unlocks); `content/studio/world_history_and_concept.json:715-736`.
- **React Client Exposure:**
  - `not found (searched: accept_quest, claim_quest_reward, quests in client/react-client/src)`.
- **Sized Next Increment:**
  - **goal:** Unify `contracts/content/quests.json`, `contracts/content/quest_board.json`, and `content/story/quests.json` inside `MetaCatalogs` (enforcing `min_level`, `prerequisite_quest_ids`, and `unlocks_class` promotion on `claim_quest_reward`), and emit `ITEM_PICKED_UP` and `ZONE_ENTERED` `MatchEvent`s from live `AtlasSimulation` systems.
  - **acceptance:** `POST /v2/rpc/accept_quest` and `POST /v2/rpc/claim_quest_reward` succeed for story and job-change quests from all three sources, live mob kills / item pickups / zone entries advance quest objectives via `MatchEventQueue`, and claiming a job-change quest promotes the player's class in `ProfileDoc`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test quests_at_runtime_test --test rust_meta_engine`

---

### 3.16 Loot
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/content/item_catalog.rs:30-37,206-235` — `LootDropSpec` and `ItemCatalog::loot_for_tier(MobTier)` returning deterministic item + gold drops per tier.
  - `server-rs/src/systems/progression.rs:130-234` — `loot_drop_on_kill_system` (spawns `LootDrop` entities on mob kills) and `loot_pickup_system` (auto-loots within `LOOT_PICKUP_RADIUS = 25.0`, deduplicated by `GrantLedger`).
  - `server-rs/src/meta/engine.rs:328-332,750-865` — `rpc_grant_loot` (`POST /v2/rpc/grant_loot`) with idempotent `grantId` ledger and `Mulberry32` RNG rolls against `contracts/content/mobs.json`.
  - `server-rs/src/content/mmorpg.rs:64-93` — `MobRosterEntry` with `drops: Vec<MobDropEntry>` (`chance_bps`, `card_id`).
  - `server-rs/tests/loot_drops_and_pickup_test.rs:19-108`, `server-rs/tests/idempotent_grants_test.rs:20-169`, `server-rs/tests/minimal_item_catalogue_test.rs:48-68`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - **[RO/L2 Reference Knowledge]:** In *Ragnarok Online* and *Lineage II*, slaying a monster rolls each item in that monster's drop table independently against its basis-point drop rate (`chance_bps`, down to `1` bps = `0.01%` for monster cards), spawns visible ground `LootDrop` entities with a 10–15s priority ownership lock for the top damage dealer/party and a 60–120s despawn TTL, and picking up the drop persists items and currency to the player's database inventory.
  - **[Codebase Gap]:**
    1. **Loot systems are not registered in `AtlasSimulation::new` (`server-rs/src/simulation.rs:191-214`):** Neither `loot_drop_on_kill_system` nor `loot_pickup_system` is added to the live simulation schedule, nor are `ItemCatalog` and `GrantLedger` inserted as resources in `AtlasSimulation::new`!
    2. **`LootDrop` entities are invisible on the wire:** `capture_wire_entities` (`server-rs/src/simulation.rs:1086-1163`) only serializes `PlayerTag` and `MobTag` entities, omitting `LootDrop` entities from FlatBuffers snapshots.
    3. **No persistence bridge from ECS pickup to `RustMetaEngine`:** `loot_pickup_system` mutates only the transient ECS `PlayerInventory` / `PlayerWallet` and never persists items to `MetaDocStore` or emits `MatchEvent::item_pickup`.
    4. **No per-mob weighted drop table roll, owner priority lock, or TTL in ECS:** `loot_drop_on_kill_system` calls `ItemCatalog::loot_for_tier` (100% deterministic item by `MobTier`) instead of rolling `Mulberry32` against the killed mob's `chance_bps` table (including `card_id` drops).
- **Content Data:**
  - `contracts/content/mobs.json:19-22,43-47,68-71,92-95` (per-mob `drops` with `chanceBps` and `cardId`); `contracts/content/items.json:1-65`; `content/studio/world_history_and_concept.json:497-590,747,755,763,771`; `content/studio/t_shaped_world_atlas.json:23` (L2 Drop/Spoil sheets).
- **React Client Exposure:**
  - `not found (searched: LootDrop, grant_loot, loot in client/react-client/src)`.
- **Sized Next Increment:**
  - **goal:** Register `loot_drop_on_kill_system` and `loot_pickup_system` (with `ItemCatalog` and `GrantLedger`) in `AtlasSimulation::new`, roll per-mob `chance_bps` drop tables (including `0.01%` cards) via `Mulberry32`, add owner priority lock + despawn TTL to `LootDrop`, replicate `LootDrop` on the wire, and persist picked-up items/gold + `ITEM_PICKED_UP` events to `RustMetaEngine`.
  - **acceptance:** Killing a mob in a live `AtlasSimulation` spawns a `LootDrop` entity visible in wire snapshots, walking within `25.0` units picks it up once (idempotent via `GrantLedger`), persists the item/gold to `InventoryDoc`/`ProfileDoc`, and advances `collect_item` quest objectives.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test loot_drops_and_pickup_test --test idempotent_grants_test`

---

### 3.17 Currency/Vendors
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/ecs/components.rs:346-352` — `PlayerWallet { gold: u64 }`.
  - `server-rs/src/content/item_catalog.rs:19-28,57-190` — `ItemDef { price_gold, sell_gold, ... }` across 13 canonical items (`pot_minor_heal`..`mat_ancient_core`).
  - `server-rs/src/systems/progression.rs:484-552` — `vendor_buy_item(world, player_entity, item_id, qty)` and `vendor_sell_item(world, player_entity, item_id, qty)` validating gold balance, inventory quantity, and non-vendable items.
  - `server-rs/tests/currency_and_vendor_test.rs:9-85` — tests buying, selling, insufficient gold rejection, and selling unowned items.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - **[RO/L2 Reference Knowledge]:** In *Ragnarok Online* (Zeny) and *Lineage II* (Adena), currency is persisted in the character database, NPC Tool/Weapon/Armor Dealers expose shop inventories validated by NPC proximity, and Merchant classes modify buy/sell prices via `Discount` (up to 24% cheaper) and `Overcharge` (up to 24% higher sell value) passives or open player shops (`Vending`).
  - **[Codebase Gap]:**
    1. **No persistent `gold` field or vendor RPCs in `RustMetaEngine`:** `ProfileDoc` and `InventoryDoc` (`server-rs/src/meta/models.rs:12-65`) have no `gold` field, and `RustMetaEngine::invoke_rpc` (`server-rs/src/meta/engine.rs:291-370`) has no `vendor_buy` or `vendor_sell` RPC endpoints (`vendor_buy_item` and `vendor_sell_item` exist only as standalone ECS functions).
    2. **Split item catalogs (`ItemCatalog` vs. `MetaCatalogs`):** `server-rs/src/content/item_catalog.rs` defines `w_sword`, `pot_minor_heal`, etc. with `price_gold`/`sell_gold`, whereas `contracts/content/items.json` (loaded by `MetaCatalogs`) defines `basic_sword`, `potion_minor`, etc. without `priceGold`/`sellGold`.
    3. **No Merchant `Discount`/`Overcharge` modifier or NPC proximity check.**
- **Content Data:**
  - `contracts/content/items.json:1-65` (lacks `priceGold`/`sellGold`); `content/studio/world_history_and_concept.json:687-714` (Blacksmith Clan & Adventure Guild shop counters).
- **React Client Exposure:**
  - `not found (searched: vendor_buy, vendor_sell, gold, wallet in client/react-client/src)`.
- **Sized Next Increment:**
  - **goal:** Add persistent `gold: u64` to `ProfileDoc` (synced with ECS `PlayerWallet`), unify `ItemCatalog` and `contracts/content/items.json` with `priceGold`/`sellGold`, and expose `POST /v2/rpc/vendor_buy` and `POST /v2/rpc/vendor_sell` on `RustMetaEngine`.
  - **acceptance:** Buying and selling items via `vendor_buy` and `vendor_sell` RPCs atomically updates persistent `ProfileDoc.gold` and `InventoryDoc.items`, rejects insufficient funds or non-vendable items, and syncs `gold` to the live ECS `PlayerWallet`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test currency_and_vendor_test --test rust_meta_engine`

---

### 3.18 Death/Bind/Travel
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/systems/live.rs:287-336` — `player_respawn_system` (registered in `server-rs/src/simulation.rs:210`, ticks `PlayerRespawnTimer` after `3.0s` and respawns at `SpawnPoint`).
  - `server-rs/src/simulation.rs:943-969` — manual `respawn` input handler when `!health.is_alive`.
  - `server-rs/src/ecs/components.rs:354-386` — `BindPoint { region_id, position, discovered_waypoints }`, `SpawnPoint`, `PlayerRespawnTimer`.
  - `server-rs/src/systems/progression.rs:15,380-482` — `DEATH_XP_PENALTY_PERCENT = 10`, `set_bind_point`, `discover_waypoint`, `apply_death_penalty_and_bind_respawn` (deducts 10% of current-level XP without de-leveling, restores HP to `max`, teleports to `BindPoint`), and `fast_travel_to_waypoint`.
  - `server-rs/src/meta/engine.rs:702-748` — `save_character_state` and `get_character_state` RPCs.
  - `server-rs/tests/death_bind_and_travel_test.rs:13-106`, `server-rs/tests/live_runtime.rs`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - **[RO/L2 Reference Knowledge]:** In *Ragnarok Online* and *Lineage II*, dying in combat applies an EXP penalty (1% in RO, 4–10% in L2 without de-leveling unless resurrected by a Priest/Bishop `Resurrection`) and respawns the player at their Kafra / Gatekeeper bound town (`BindPoint`, transferring across regions if the bind town is in another zone). Players can bind at town NPCs, unlock regional waypoints, and fast-travel between discovered waypoints out of combat for a gold fee or *Fly Wing / Butterfly Wing / Return Feather*.
  - **[Codebase Gap]:**
    1. **Live respawn completely bypasses `apply_death_penalty_and_bind_respawn`:** Both `player_respawn_system` (`server-rs/src/systems/live.rs:287-336`) and manual `respawn` input (`server-rs/src/simulation.rs:943-969`) restore full HP and teleport the player to `SpawnPoint` with **0% XP penalty**, ignoring `BindPoint` and `apply_death_penalty_and_bind_respawn` (`server-rs/src/systems/progression.rs:413-453`)!
    2. **No network triggers or persistence for `BindPoint` and waypoints:** `set_bind_point`, `discover_waypoint`, and `fast_travel_to_waypoint` have no RPC/HTTP/WS handlers, `CharacterStateDoc` (`server-rs/src/meta/models.rs:67-76`) does not persist `bind_region_id` / `bind_position` / `discovered_waypoints`, and `fast_travel_to_waypoint` neither checks combat state nor transfers the player's WebSocket across regions when `destination.region_id != current_region_id`.
- **Content Data:**
  - `content/towns/town-millcross.json`, `content/zones/*.json`, `content/studio/world_history_and_concept.json:712,878,1159,1305-1749` (6 racial home towns, Novice Home Town Return Feather, Fast-Travel Charter Passes).
- **React Client Exposure:**
  - **Partial:** `client/react-client/src/hooks/useServerRsClient.ts:1339-1350` sends `respawnFlag: true` on `ClientInput`, wired to the Respawn button in `client/react-client/src/components/EntityCard.tsx:44,217-221` and `client/react-client/src/components/ColyseusGameCanvas.tsx:351-355`. No bind-point or waypoint fast-travel UI exists.
- **Sized Next Increment:**
  - **goal:** Wire `player_respawn_system` and manual `respawn` input in `AtlasSimulation` to `apply_death_penalty_and_bind_respawn` (including cross-region transfer when `BindPoint.region_id` differs), persist `BindPoint` and `discovered_waypoints` in `CharacterStateDoc`, and expose `set_bind_point`, `discover_waypoint`, and out-of-combat `fast_travel` over RPC/WS.
  - **acceptance:** Dying and respawning in `AtlasSimulation` deducts `10%` of current-level XP (never de-leveling) and relocates the player to their persisted `BindPoint`, and calling `fast_travel` out of combat teleports the player to any discovered waypoint.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test death_bind_and_travel_test --test live_runtime`

---

### 3.19 Companions
- **Status:** `partial`
- **Server & Test Evidence:**
  - `server-rs/src/ecs/components.rs:238-285` — `COMPANION_FOLLOW_DISTANCE = 4.0`, `COMPANION_STOP_DISTANCE = 2.5`, `COMPANION_TELEPORT_DISTANCE = 40.0`, `COMPANION_ATTACK_RANGE = 3.0`, `COMPANION_AGGRO_RADIUS = 12.0`, `COMPANION_ATTACK_INTERVAL_SEC = 1.0`, `COMPANION_RESPAWN_DELAY_SEC = 10.0`, `CompanionTag`, `CompanionAi { owner, owner_player_id, attack_damage, next_attack_time, respawn_at }`.
  - `server-rs/src/systems/companion.rs:9-287` — `spawn_companion`, `companion_follow_system`, `companion_combat_system`, `companion_respawn_system`.
  - `server-rs/src/systems/progression.rs:116-124` — inside `experience_on_kill_system`, checks `world.get::<CompanionAi>(killer_entity)` to route XP to `comp.owner`.
  - `server-rs/tests/companion_spawn_follow_test.rs:21-105`, `server-rs/tests/companion_combat_respawn_test.rs:39-167`.
- **What is Missing vs. RO/L2 Reference Behaviour (`[RO/L2 Reference Knowledge + Codebase Gap]`):**
  - **[RO/L2 Reference Knowledge]:** In *Ragnarok Online* (Cute Pets, Alchemist Homunculi, Mercenaries) and *Lineage II* (Wolf, Hatchling/Strider, Summoner Servitors), players summon a companion that follows them in live zones, assists in combat, credits all kills/XP/loot to its owner, and is replicated in world snapshots so all nearby players see it.
  - **[Codebase Gap]:**
    1. **Companion systems are not registered in `AtlasSimulation::new` (`server-rs/src/simulation.rs:191-214`):** `companion_follow_system`, `companion_combat_system`, and `companion_respawn_system` are never added to the live `AtlasSimulation` schedule, and there is no RPC/WS command or spawn hook to summon a companion in a live room!
    2. **Companion killing blows never push to `HitLog`:** In `companion_combat_system` (`server-rs/src/systems/companion.rs:207-220`), the companion calls `mob_hp.take_damage(dmg)` directly without recording a `HitRecord` in `HitLog`. Because `experience_on_kill_system` (`server-rs/src/systems/progression.rs:84`) and `loot_drop_on_kill_system` (`server-rs/src/systems/progression.rs:143`) only inspect `HitLog`, **a companion landing the killing blow awards 0 XP and 0 loot to its owner** despite the dead-code `CompanionAi` check at `server-rs/src/systems/progression.rs:116-124`!
    3. **Companions are excluded from FlatBuffers wire snapshots:** `capture_wire_entities` (`server-rs/src/simulation.rs:1086-1163`) queries `Or<(With<PlayerTag>, With<MobTag>)>`, omitting `CompanionTag` entities so clients never receive companion snapshots.
- **Content Data:**
  - `not found (searched: companion, pet, homunculus across content/ and contracts/content/)`.
- **React Client Exposure:**
  - **Partial (Renderer Exists, Wire Decoder Unwired):** `client/react-client/src/renderers/companionRenderer.ts:11-107` (`drawCompanions`), `client/react-client/src/types/game.ts:71-75` (`Companion`), and `client/react-client/src/components/GameRenderer.tsx:409-412` exist, but `client/react-client/src/hooks/useServerRsClient.ts:622-731` only decodes `EntityType.Player`, `EntityType.Mob`, and `EntityType.Projectile`, leaving `gameState.npcs` / `companions` empty.
- **Sized Next Increment:**
  - **goal:** Register `companion_follow_system`, `companion_combat_system`, and `companion_respawn_system` in `AtlasSimulation::new`, record a `HitRecord` in `HitLog` when a companion damages/kills a mob so `experience_on_kill_system` and `loot_drop_on_kill_system` credit the owner, and include `CompanionTag` entities in `capture_wire_entities`.
  - **acceptance:** Summoning/spawning a companion in `AtlasSimulation` ticks follow/combat/respawn, a companion killing blow awards full XP and loot to `comp.owner`, and `capture_wire_entities` serializes the companion entity into FlatBuffers world snapshots.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test companion_spawn_follow_test --test companion_combat_respawn_test`

---

## 4. Ranked Gap List by Player Impact (Build Wave Roadmap)

The 19 mechanics are ranked below from **highest player-facing impact (`Rank 1`) to lowest (`Rank 19`)**, prioritizing gaps where implemented ECS/domain modules are currently disconnected from the live `AtlasSimulation` tick loop, FlatBuffers wire protocol, or `RustMetaEngine` persistence layer.

### Wave 1 — Core Live Combat & Progression Loop (Critical Disconnected Systems)

#### Rank 1: Instanced Dungeon Live Simulation & Seamless Entry/Egress (Mechanic #13)
- **Why Rank 1:** Stepping onto a dungeon portal in a live room currently reassigns the player's WebSocket to an `instance_id` that has no `AtlasSimulation` in `AppState.rooms`, freezing the player's world stream.
- **Increment Spec:**
  - **goal:** Dynamically spawn and tick an instanced `AtlasSimulation` per active `DungeonInstance` (populated from `DungeonCatalog`), record the player's pre-entry overworld `(region_id, x, z)` via `set_instance_origin`, transfer the player's ECS avatar + WebSocket into the dungeon simulation on entry, and transfer both back to `(return_region_id, return_x, return_z)` on egress.
  - **acceptance:** Stepping onto a `DungeonPortal` transfers the player into a live ticking `AtlasSimulation` for `instance_id` with catalog-driven floor mobs and boss, and calling `/dungeons/egress` (or stepping onto the exit portal) restores the player's avatar and WebSocket stream to their exact overworld origin coordinates.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test dungeon_gateway_allocation_test --test dungeon_egress_test --test dungeon_spire_and_catalog_test`

#### Rank 2: Live Ground Loot Drops, Pickup, and Persistence Bridge (Mechanic #16)
- **Why Rank 2:** `loot_drop_on_kill_system` and `loot_pickup_system` are not registered in `AtlasSimulation::new`, so killing monsters in live rooms never drops ground items or gold.
- **Increment Spec:**
  - **goal:** Register `loot_drop_on_kill_system` and `loot_pickup_system` (with `ItemCatalog` and `GrantLedger`) in `AtlasSimulation::new`, roll per-mob `chance_bps` drop tables (including `0.01%` cards) via `Mulberry32`, add owner priority lock + despawn TTL to `LootDrop`, replicate `LootDrop` on the wire, and persist picked-up items/gold + `ITEM_PICKED_UP` events to `RustMetaEngine`.
  - **acceptance:** Killing a mob in a live `AtlasSimulation` spawns a `LootDrop` entity visible in wire snapshots, walking within `25.0` units picks it up once (idempotent via `GrantLedger`), persists the item/gold to `InventoryDoc`/`ProfileDoc`, and advances `collect_item` quest objectives.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test loot_drops_and_pickup_test --test idempotent_grants_test`

#### Rank 3: Unified Quest Catalogs & Live Objective Events (Mechanic #15)
- **Why Rank 3:** `MetaCatalogs` only loads 3 test quests (`contracts/content/quests.json`), blocking players from accepting any of the 28 authored story quests (`content/story/quests.json`) or 8 job-change/bounty quests (`contracts/content/quest_board.json`).
- **Increment Spec:**
  - **goal:** Unify `contracts/content/quests.json`, `contracts/content/quest_board.json`, and `content/story/quests.json` inside `MetaCatalogs` (enforcing `min_level`, `prerequisite_quest_ids`, and `unlocks_class` promotion on `claim_quest_reward`), and emit `ITEM_PICKED_UP` and `ZONE_ENTERED` `MatchEvent`s from live `AtlasSimulation` systems.
  - **acceptance:** `POST /v2/rpc/accept_quest` and `POST /v2/rpc/claim_quest_reward` succeed for story and job-change quests from all three sources, live mob kills / item pickups / zone entries advance quest objectives via `MatchEventQueue`, and claiming a job-change quest promotes the player's class in `ProfileDoc`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test quests_at_runtime_test --test rust_meta_engine`

#### Rank 4: Parties, Friends, and Chat Network Wiring & Party XP Share (Mechanic #14)
- **Why Rank 4:** An MMORPG requires multiplayer social interaction and party XP sharing, yet `systems/social.rs` has zero RPC/WebSocket endpoints and `experience_on_kill_system` never calls `grant_party_kill_rewards`.
- **Increment Spec:**
  - **goal:** Insert `SocialHub` into `AtlasSimulation` and shared `AppState`, wire WebSocket/RPC handlers for chat (`Nearby`/`Party`/`World`/`Whisper`), friends (`request`/`accept`/`remove`/`list`/`join`), and parties (`create`/`invite`/`accept`/`leave`/`kick` with max 6 members), and invoke `grant_party_kill_rewards` from `experience_on_kill_system`.
  - **acceptance:** Two connected players can form a party over RPC/WS, exchange `Nearby`/`Party`/`World` chat messages over WebSocket, see live party HP/position snapshots, and receive shared XP/gold when a party member kills a mob within `PARTY_SHARE_RADIUS`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test nearby_and_world_chat_test --test friends_list_test --test parties_test --test find_and_join_friends_test`

#### Rank 5: Primary Stats Driving Live ECS Combat (`CharacterAttributes` Integration) (Mechanic #2)
- **Why Rank 5:** Players can allocate `STR/AGI/VIT/INT/DEX/LUK` via `allocate_stats`, but live ECS combat still uses flat level formulas (`CombatStats::for_level`) and ignores `CharacterAttributes`.
- **Increment Spec:**
  - **goal:** Attach `CharacterAttributes` + `StatPointLedger` to player entities in `AtlasSimulation`, derive live ECS `Health`, `CombatStats`, `Crit`, `Flee/Hit`, and `CastingState` durations from `DerivedCombatStats::compute`, and apply the canonical RO triangular stat cost `((base_val - 1) / 10) + 2`.
  - **acceptance:** Allocating `STR/AGI/VIT/INT/DEX/LUK` via `allocate_stats` updates the player's live ECS `Health.max`, physical/magical damage, hit/flee evasion roll, crit chance, attack interval, and skill cast duration in `AtlasSimulation`, verified by unit + integration tests.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test race_and_attributes_test --test rust_meta_engine`

#### Rank 6: ASPD and Variable/Fixed Cast-Time Curves in Live Skill Execution (Mechanic #3)
- **Why Rank 6:** All player attacks in `AtlasSimulation` are fixed at `0.45s` (`~2.22 hits/s`) and skill casts use raw unscaled durations (`1.5s`), making `AGI` and `DEX` ineffective in live combat.
- **Increment Spec:**
  - **goal:** Split skill cast times into `fixed_cast_ms` (20%) + `variable_cast_ms` (80% scaled by `DEX`/`INT` via `DerivedCombatStats::cast_time_multiplier`) in `skill_execution_system`, and drive player `AttackCooldown` / `ProjectileWeapon.cooldown_sec` from `DerivedCombatStats::attack_interval_secs()` with per-weapon-class base ASPD.
  - **acceptance:** High-`AGI`/`DEX` characters fire auto-attacks up to `7.0 hits/sec` (`0.1428s` interval) and scale only the 80% variable cast window down to instant while preserving the 20% fixed cast floor in `skill_execution_system`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test race_and_attributes_test --test cast_interruption_test`

---

### Wave 2 — Boss Encounters, Combat Depth & Itemization Power

#### Rank 7: Boss Phases & Enrage Wired into Live ECS `MobAi` (Mechanic #9)
- **Why Rank 7:** `BossEncounterState` computes Phase 1/2/3 and enrage multipliers (`3.0x ATK`, `1.5x ASPD`), but live ECS boss entities never read those multipliers or unlock Phase 2/3 boss skills.
- **Increment Spec:**
  - **goal:** Synchronize live ECS boss entities (`Health`, `CombatStats`, `MobAi`) with `BossEncounterState` each simulation tick so crossing `70%` / `30%` HP or `enrage_limit_secs` dynamically scales the ECS boss's damage/cooldowns, unlocks Phase 2/3 AoE skills, and broadcasts boss phase changes to clients.
  - **acceptance:** Damaging a boss entity in `AtlasSimulation` below `70%` and `30%` HP or exceeding `enrage_limit_secs` transitions `BossEncounterState`, increases live ECS boss attack damage and attack speed, and emits phase/enrage state in the dungeon status payload.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test dungeon_boss_encounter_test --test boss_tier_scaling_test`

#### Rank 8: RO/L2 Weighted MVP Reward Distribution & Item Persistence (Mechanic #10)
- **Why Rank 8:** MVP contribution weights (`50/20/15/10/5`) are only recorded via manual test helpers, and winning MVP rewards never grants persistent items, gold, or XP to the winners.
- **Increment Spec:**
  - **goal:** Automatically pipe live ECS boss damage, tank damage taken, support healing, and first-hit events inside dungeon instances into `DungeonRegistry`, and on boss death invoke `finalize_boss_mvp` to grant persistent MVP bonus loot + XP via `RustMetaEngine` and broadcast the MVP scoreboard to the party.
  - **acceptance:** Killing a dungeon boss in live combat populates `ContributionRecord`s automatically, resolves the 50/20/15/10/5 weighted MVP scoreboard, and persists the MVP item/XP reward to the winning character's `InventoryDoc` / `ProfileDoc`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test dungeon_boss_encounter_test --test dungeon_wipe_and_mvp_healing_test`

#### Rank 9: Cast Interruption Across Projectiles, Skills, and Crowd Control (Mechanic #11)
- **Why Rank 9:** In live rooms, all mobs and ranged/magic attacks use projectiles (`projectile_collision_system`), which currently never interrupt `CastingState`.
- **Increment Spec:**
  - **goal:** Interrupt `CastingState` (when `!uninterruptible` and no `Endure` / Phen buff is active) across all direct-damage paths (`projectile_collision_system`, `lingering_zone_system`, `skill_execution_system`) and hard CC (`Stun`/`Knockback`), and emit cast interruption state to clients so the cast bar aborts immediately.
  - **acceptance:** A ranged mob projectile hit, direct-damage skill hit, or stun effect in `AtlasSimulation` cancels an interruptible `CastingState` while preserving casts guarded by `uninterruptible` or `card_phen_uninterruptible_cast`, verified by integration tests in `server-rs/tests/cast_interruption_test.rs`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test cast_interruption_test`

#### Rank 10: 4-Slot Card Sockets Driving Live Combat Hooks (Mechanic #5)
- **Why Rank 10:** Players can socket cards into items via `socket_card`, but `compile_equipped_card_modifiers` is never hooked into live ECS damage, drain, splash, or cast interruption systems.
- **Increment Spec:**
  - **goal:** Bridge `compile_equipped_card_modifiers` into live ECS player entities so socketed cards actively apply racial/elemental/size damage multipliers, Hunter Fly HP drain, Baphomet splash, Phen uninterruptible cast (`CastingState.uninterruptible`), and GTB magic immunity during `combat_system` and `skill_execution_system`, and enforce equipment-slot restrictions on `socket_card`.
  - **acceptance:** Equipping an item with socketed Hydra/Skel Worker/Hunter Fly/Phen/GTB cards modifies live ECS damage dealt, heals on hit, prevents cast interruption on direct damage, and rejects socketing a weapon card into armor.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test enchant_and_sockets_test --test cast_interruption_test`

#### Rank 11: +20 High-Stakes Enchanting Driving Live Combat ATK/DEF & Safe-Cap Alignment (Mechanic #4)
- **Why Rank 11:** `+1..+20` refinement exists in `enchantment.rs` and `rpc_enchant_equipment`, but `refine_bonus_permille` never increases live ECS weapon ATK / armor DEF, and `refine_equipment` (`+4` safe cap) diverges from `enchantment.rs` (`+3` safe cap).
- **Increment Spec:**
  - **goal:** Unify `rpc_refine_equipment` onto `content::enchantment::attempt_enchant` (single `+1..+20` authority), feed `refine_bonus_permille` into live ECS player `CombatStats` (`attack_damage` / defense), and expose the `+20` enchant preview (`success_rate`, `on_failure`, catalyst toggle) and action in `client/react-client/src`.
  - **acceptance:** `refine_equipment` and `enchant_equipment` share the exact `+1..+20` table, equipping a `+10` weapon measurably increases live ECS damage by `+96%` (`refine_bonus_permille(10) == 960`), and `cargo test` passes.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test enchant_and_sockets_test --test rust_meta_engine`

#### Rank 12: 24 Standard Buff Slots + 12 Song/Dance Slots in Live ECS Schedule (Mechanic #6)
- **Why Rank 12:** `BuffBar` (24 standard + 12 ensemble slots) and `spatial_aura_broadcast_system` are implemented in `combat/buffs.rs`, but `AtlasSimulation` still uses the legacy 3-boolean `StatusEffects` component.
- **Increment Spec:**
  - **goal:** Register `BuffBar` and `spatial_aura_broadcast_system` in `AtlasSimulation` (`server-rs/src/simulation.rs`), fold `BuffBar::aggregate_modifiers()` into `combat_system` / `skill_execution_system`, and serialize active buff IDs/expiries to the client HUD.
  - **acceptance:** Casting buffs or Bard/Dancer songs in `AtlasSimulation` populates the 24+12 `BuffBar`, modifies live ECS damage/defense/speed via `aggregate_modifiers()`, and expires buffs deterministically on tick.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test combat_buffs_and_auras_test --test aura_spatial_bench_test`

---

### Wave 3 — World Persistence, Economy, Companions & Infrastructure Polish

#### Rank 13: Persistent Currency (`gold`) & Vendor Buy/Sell RPCs (Mechanic #17)
- **Why Rank 13:** `vendor_buy_item` and `vendor_sell_item` exist in `systems/progression.rs`, but `ProfileDoc` has no persistent `gold` field and `RustMetaEngine` has no vendor RPCs.
- **Increment Spec:**
  - **goal:** Add persistent `gold: u64` to `ProfileDoc` (synced with ECS `PlayerWallet`), unify `ItemCatalog` and `contracts/content/items.json` with `priceGold`/`sellGold`, and expose `POST /v2/rpc/vendor_buy` and `POST /v2/rpc/vendor_sell` on `RustMetaEngine`.
  - **acceptance:** Buying and selling items via `vendor_buy` and `vendor_sell` RPCs atomically updates persistent `ProfileDoc.gold` and `InventoryDoc.items`, rejects insufficient funds or non-vendable items, and syncs `gold` to the live ECS `PlayerWallet`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test currency_and_vendor_test --test rust_meta_engine`

#### Rank 14: Death XP Penalty, Bind Point Respawn, and Fast-Travel Wiring (Mechanic #18)
- **Why Rank 14:** Live respawn in `AtlasSimulation` currently bypasses `apply_death_penalty_and_bind_respawn`, giving 0% XP penalty and ignoring `BindPoint`.
- **Increment Spec:**
  - **goal:** Wire `player_respawn_system` and manual `respawn` input in `AtlasSimulation` to `apply_death_penalty_and_bind_respawn` (including cross-region transfer when `BindPoint.region_id` differs), persist `BindPoint` and `discovered_waypoints` in `CharacterStateDoc`, and expose `set_bind_point`, `discover_waypoint`, and out-of-combat `fast_travel` over RPC/WS.
  - **acceptance:** Dying and respawning in `AtlasSimulation` deducts `10%` of current-level XP (never de-leveling) and relocates the player to their persisted `BindPoint`, and calling `fast_travel` out of combat teleports the player to any discovered waypoint.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test death_bind_and_travel_test --test live_runtime`

#### Rank 15: Boss Wipe Clearing Contribution Ledger & Resetting Live ECS Boss (Mechanic #12)
- **Why Rank 15:** `check_party_wipe` resets `BossEncounterState` to 100% HP and Phase 1, but leaves `inst.contributions` dirty and transitions the instance to a permanent `DungeonState::Failed` state without resetting the live ECS boss.
- **Increment Spec:**
  - **goal:** Clear `inst.contributions` on `check_party_wipe`, keep the instance fightable (`DungeonState::Active` until TTL expiration), and wire an ECS dungeon wipe check that resets both `BossEncounterState` and the live ECS boss entity (`Health`, `ThreatTable`, `Position`) when all players in the instance are dead.
  - **acceptance:** Wiping on a boss clears `inst.contributions`, restores boss HP to 100% and Phase 1 in both `DungeonRegistry` and the ECS world, and allows the party to re-engage and defeat the boss on a fresh pull with clean MVP weights.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test dungeon_wipe_and_mvp_healing_test`

#### Rank 16: Companions Registered in Live Simulation, `HitLog` Kill Credit, and Wire Snapshot (Mechanic #19)
- **Why Rank 16:** Companion systems are not registered in `AtlasSimulation::new`, companion killing blows do not push to `HitLog` (awarding 0 XP/loot), and companions are omitted from FlatBuffers wire snapshots.
- **Increment Spec:**
  - **goal:** Register `companion_follow_system`, `companion_combat_system`, and `companion_respawn_system` in `AtlasSimulation::new`, record a `HitRecord` in `HitLog` when a companion damages/kills a mob so `experience_on_kill_system` and `loot_drop_on_kill_system` credit the owner, and include `CompanionTag` entities in `capture_wire_entities`.
  - **acceptance:** Summoning/spawning a companion in `AtlasSimulation` ticks follow/combat/respawn, a companion killing blow awards full XP and loot to `comp.owner`, and `capture_wire_entities` serializes the companion entity into FlatBuffers world snapshots.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test companion_spawn_follow_test --test companion_combat_respawn_test`

#### Rank 17: 6 Canonical Races Wired to Character Creation & Starting Towns (Mechanic #1)
- **Why Rank 17:** All 6 races and racial passives exist in `races.rs`, but `create_character` does not persist `race` or spawn new characters in their racial home town (`content/studio/world_history_and_concept.json`).
- **Increment Spec:**
  - **goal:** Wire `RaceId` into `ProfileDoc` / character creation RPC, apply `starting_attributes_for_race(race)` + `starting_town_for_race(race)` on new character initialization, and fold `RacialPassive` modifiers into `combat_system` / `skill_execution_system` and the React character creation UI.
  - **acceptance:** `POST /v2/rpc/create_character` (or profile init) persists `race`, seeds `CharacterAttributes` with `starting_attributes_for_race(race)`, sets initial `region_id` to the race's canonical home town, and applies racial passive modifiers in `server-rs/src/systems/combat.rs`.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test race_and_attributes_test --test rust_meta_engine`

#### Rank 18: Spatial Portal Triggers Supporting Overworld Zone-to-Zone Warps & Level Gates (Mechanic #7)
- **Why Rank 18:** `portal_trigger_system` works in live rooms for dungeon portals, but lacks overworld zone-to-zone warp target coordinates and minimum-level/key validation, and portals are not rendered on the React canvas.
- **Increment Spec:**
  - **goal:** Extend `DungeonPortal` (or `SpatialPortal`) to support both overworld zone-to-zone coordinate warps and dungeon instance portals with `min_level` validation, and serialize portal positions to the React client so players can see portal rings on the canvas.
  - **acceptance:** Walking into an overworld portal transitions the player's region and spawn coordinates without allocating a dungeon instance, while under-leveled players stepping onto a gated dungeon portal receive a rejection event instead of transitioning.
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test dungeon_gateway_allocation_test`

#### Rank 19: Agones Match Allocation Wired to Live Dungeon Gateway & SDK Sidecar HTTP Calls (Mechanic #8)
- **Why Rank 19:** `AgonesSidecarClient` and `MatchAllocator` have full state machines and unit tests, but `handle_dungeon_portal_entry` does not call `MatchAllocator::allocate_match` and `AgonesSidecarClient` only mutates in-memory structs instead of issuing HTTP requests to `AGONES_SDK_HTTP_PORT` when running in Kubernetes.
- **Increment Spec:**
  - **goal:** Wire `MatchAllocator::allocate_match` into `handle_dungeon_portal_entry` / `/dungeons/enter` and `/dungeons/egress` (`release_match`), and add an optional live Agones SDK HTTP transport (`http://127.0.0.1:${AGONES_SDK_HTTP_PORT}`) behind `AgonesSidecarClient` when `AGONES_SDK_HTTP_PORT` is set.
  - **acceptance:** Allocating a dungeon instance transitions the backing `MatchAllocator` pod to `Allocated` with `agones.dev/sdk-instance-id` and `agones.dev/sdk-party-id` labels, and completing/egressing the instance releases the match back to `Ready` (or `Shutdown`).
  - **verifyCmd:** `cargo test --manifest-path server-rs/Cargo.toml --test fleet_and_auth --test dungeon_gateway_allocation_test`
