# 🚀 Atlas World - Real-time Multiplayer Game

A high-performance real-time multiplayer game built with a modern high-density architecture: **server-rs** (authoritative Rust ECS game server with FlatBuffers binary delta replication and native in-process **Rust Meta & Persistence Engine**).

---

## 🏗️ Architecture

### High-Density Rust Simulation Engine (`server-rs`) — Epic E-001
- **Architecture:** Authoritative headless simulation engine built with `bevy_ecs 0.15` and `rapier2d 0.22`.
- **Zero GC Overhead:** Replaces Node.js single-threaded event loop with archetypal SoA cache locality, dual-layer contiguous `SpatialGrid`, and Rayon multithreaded task pools.
- **Empirical Scale Benchmarks (Criterion):**
  - **1,000 entities:** $78.8\text{ }\mu\text{s}$ ($0.078\text{ ms}$)
  - **10,000 entities:** $503.8\text{ }\mu\text{s}$ ($0.503\text{ ms}$) — 50% under the $1.0\text{ ms}$ budget
  - **20,000 entities:** $1.03\text{ ms}$ — 58% under the $2.5\text{ ms}$ budget
- **Deterministic Parity:** Verified against TypeScript baseline golden simulation trace (`golden_sim_trace_1000.json`) with $\epsilon \le 0.05$ coordinate parity across 1,000 ticks.
- **Binary Delta Protocol (FlatBuffers):** Zero-allocation state serialization (`schemas/game_protocol.fbs`) broadcasting deltas at $20\text{ Hz}$ with $< 250\text{ B}$ typical AOI frame payload ($< 5\text{ KB/s}$ wire bandwidth).
- **Client Cutover:** Full web client cutover via `useServerRsClient` React hook connecting directly to `server-rs` WebSocket gateway with FlatBuffers decoding.
- **Platform Utility Integration:** Standalone functional wrappers (`withRetry`, `withCache`, `withCircuitBreaker`, `withRateLimit`, `withDistributedLock`, `withTrace`, `withTracking`) supported from `node-server-decorator`.

### Domain Parity: Elemental Combat & Skill Execution (`server-rs`) — Epic E-002
- **Elemental Matrix:** 7 elements (`Neutral`, `Earth`, `Water`, `Wind`, `Fire`, `Holy`, `Void`) with RO-style advantage cycle (Water > Fire > Earth > Wind > Water at 2.0x, Holy <-> Void duel at 2.0x, 0.5x resist).
- **Damage Formula:** Exact damage mitigation with defense reduction capped at 80% base damage, armor addition, elemental multipliers, and 1.0 floor.
- **Skill Execution:** Full player and mob skills (`skill_1` Meteor Strike, `skill_2` Precision Strike, `skill_3` Blizzard with Freeze, `skill_4` Thunder Strike with Stun, `skill_dash` Dash with 160.0 velocity impulse).
- **Projectile Kinematics:** Integrated kinematic projectile integration, lifetime/range limits, and spatial grid collision detection.

### Mobile MMORPG Client (Godot 4.7 C# NativeAOT / iOS)
- **Engine & Runtime:** Godot Engine 4.7 with C# / .NET 8 compiled to 100% NativeAOT for zero JIT latency, strict iOS App Store compliance, and immediate 60 FPS Metal rendering on Apple Silicon.
- **Zero-Reflection Architecture:** Built without runtime reflection or dynamic code generation. All UI events communicate through decoupled Godot C# signals (`[Signal] delegate void ...`).
- **Mobile MMORPG HUD (Ragnarok-Style Ergonomics):**
  - **PlayerFrame (Top-Left):** Circular portrait badge, Level 90 tag, green HP progress bar (`14,850 / 14,850`), blue SP progress bar (`3,200 / 3,200`).
  - **TopBar & Radar (Top-Right):** Circular minimap radar with coordinate readout (`Atlas Spar 120, 240`), ping status, and quick menu buttons (`[🎒 Bag]`, `[👗 Wardrobe]`, `[📜 Quests]`).
  - **Compact Dual-State ChatBox (Bottom-Center):** Default collapsed translucent single-line ticker pill (`[System] Welcome to Atlas World`) that expands into a multi-tab modal (`[All]`, `[World]`, `[Party]`, `[System]`) upon tap.
  - **Dual-Thumb Combat Controls:** Dynamic virtual joystick on the bottom-left with touch clamping, paired with a radial skill action cluster on the bottom-right (`[ATK]`, `[DASH]`, `[S1] Meteor`, `[S2] Blizzard`).
- **Split-Screen Wardrobe & Equipment Modal:**
  - **Interactive 3D SubViewport (Left 45%):** Live 3D character preview mounted on a pedestal with camera and omni lighting. Supports 360° touch drag rotation.
  - **Tabbed Equipment Grid (Right 55%):** Category tabs (`Weapons`, `Armor`, `Hair`, `Sets`) with rarity color borders (Epic purple, Rare blue), level requirements, stat diffs (`+140 M.ATK`, `+65 P.ATK`), **[Try On]** tween preview, and **[Equip]** real-time avatar mutation.
  - **Input Isolation:** Disables background joystick and hero movement while typing in chat or inspecting gear in modals.

### Legacy Core Simulation Engine (Colyseus TypeScript — Migration to Rust in progress)
- **Authoritative 2.5D Model:** Per-floor 2D physics using `Planck.js`. Being replaced by `server-rs` in release 1.11 (Epic E-002).

### Native Rust Meta & Persistence Engine (`server-rs/src/meta/` — Feature F-091)
- **Zero-Overhead Single-Binary Meta Engine:** Built directly into `server-rs` to replace the Go/Goja Nakama + CockroachDB stack while preserving 100% `/v2/*` HTTP wire compatibility (`POST /v2/account/authenticate/device`, `GET /v2/account`, `POST /v2/storage`, `GET|POST /v2/rpc/{id}`).
- **In-Process `NakamaStorage` Implementation:** `RustMetaEngine` implements `NakamaStorage` directly in-memory/in-process so join-time `get_loadout`, match-event reporting (`report_match_events`), and character-state checkpointing (`save_character_state`) execute with zero HTTP S2S round-trip overhead.
- **Trait-Backed Persistence (`MetaDocStore`):**
  - `InMemoryMetaStore`: Zero-dependency default when `META_DB_PATH` is unset.
  - `SqliteMetaStore`: Embedded `rusqlite` (`WAL` mode + `BEGIN IMMEDIATE` multi-key atomic CAS transactions) configured via `META_DB_PATH=./data/meta.db`.
  - `PostgresMetaStore`: Conditional-DML SQL transaction adapter for multi-pod Kubernetes clusters (`META_POSTGRES_URL`).

### Orchestration & Fleet Lifecycle (Agones — Epic E-001 Slices 4 & 5)
- **Lifecycle Management:** Dedicated `FleetLifecycle` trait in `server-rs` connecting to the Agones SDK sidecar (`localhost:9357`).
- **Containerization:** Multi-stage Debian/Rust Docker image (`server-rs/Dockerfile`, $< 35\text{ MB}$), with local Kubernetes Deployment and Agones `GameServer` manifest (`k8s/local/server-rs.yaml`).
- **Cold Boot Time:** $< 5\text{ ms}$ (budget: $< 50\text{ ms}$).

### Meta-Systems & Token Authentication (`server-rs/src/auth/`)
- **Session Authentication:** `AuthGuard` both issues (`issue_session_token`) and validates HS256-signed JWT tokens (`tid`, `uid`, `usn`, `exp`) against `NAKAMA_SESSION_KEY` / `NAKAMA_SERVER_KEY`.
- **Zero-Leeway Verification:** Rejects unauthenticated connections, expired sessions, and forged tokens before establishing WebSocket session.
- **WebSocket Gateway:** Native `tokio-tungstenite` server accepting binary FlatBuffers frames and broadcasting `WorldSnapshot` frames while multiplexing `/v2/*` Meta HTTP endpoints on the same port (and optional `META_BIND_ADDR`).

### Dedicated 20-Dimension (`D1–D20`) Semantic-Zoom World, Town & Multi-Floor Dungeon Atlas (`scripts/catalog_explorer_web.py` — `:8788`)
- **Dedicated Semantic-Zoom Atlas (`DedicatedWorldAtlasComponent` / `renderDedicatedWorldAtlas`):** Interactive 2D cartographic explorer inspired by Lineage II (`l2hub.info/c3/map` Gludin / Dark Elven Village / Oren by Cheese, The Ant Nest `B1–B3`, Cruma Tower `1F–3F`, Tower of Insolence) and Google/Apple Maps:
  - **3-Tier Semantic Zoom LOD:**
    - **Tier 1 (`1.0×–2.2×` Macro Geography):** Uncluttered continuous world map with priority AABB label culling, inter-zone travel highways, and all **6 Playable Race Spawn Locations** (`Human`, `Lunar`, `Ogre/Orc`, `Dwarf`, `Dark-Lunar`, `Furral`).
    - **Tier 2 (`2.2×–4.5×` Regional Roads & Portals):** Reveals regional hunting territory rings, level-band highway shields, and clickable **Multi-Floor Dungeon Entrance Portals**.
    - **Tier 3 (`4.5×–12.0×` Town Street, Building & Service-Mark Blueprint):** Automatically transitions to walled Town Street Blueprints across all **15 Towns** (6 Starting Towns + 9 Castle/Hub Towns) with `#1..#12` numbered buildings, **7 canonical service marks** (`equip_shop`, `consumable_shop`, `blacksmith` / `refinement_anvils`, `temple`, `warehouse`, `guild`, `gatekeeper`), and an Oren-by-Cheese color-coded `1..12` NPC Roster.
  - **Multi-Floor Underground & Tower Sub-Maps (`openDungeonSubMap` / `switchDungeonFloor`):** Interactive floor stacks across all **16 Multi-Floor Dungeons & Catacombs** (`B1 ⇄ B2 ⇄ B3` underground labyrinths and `1F ⇄ 2F ⇄ 3F` vertical spires) with clickable inter-floor warp portals, vertical cutaway elevation diagrams (`D12`), and clickable room/chamber tactical inspectors (`D18`).
  - **Interactive Blacksmith Refinement (`+1..+15`) & Spoil Source Locator (`D19` — `refinement_grade_matrix`):** Covers all **6 Equipment Grades** (`No-Grade Lv.1–19`, `D-Grade Lv.20–39`, `C-Grade Lv.40–51`, `B-Grade Lv.52–60`, `A-Grade Lv.61–75`, `S-Grade Lv.76–99`) with `+1..+15` anvil rates (Safe `+3`, Max `+15`), representative weapons/armor, required spoil materials, and 1-click buttons to **Jump to Blacksmith Town Street Map** or **Highlight Material Drop Zones / Open Dungeon Floor**.
  - **Bidirectional 4-Perspective Studio ⇄ Dedicated World Atlas Sync (`D20` — `syncStudioNodeToDedicatedAtlas`):** Drilling into any Town, Field Hunting Area, or Dungeon node in the 4-Perspective Studio automatically synchronizes `ATLAS_FOCUSED_TOWN_ID`, `ATLAS_FOCUSED_FIELD_ID`, and `ATLAS_ACTIVE_DUNGEON_ID` on the Dedicated World Atlas.
  - **Interactive 5-Tier Boss Power Hierarchy & Sealed-God Chain Overlay (`D21` — `boss_hierarchy_chains`):** Covers all **6 Primordial Sealed Gods** (`god-sola-hearth-weaver`, `god-krono-brass-titan`, `god-vesper-dream-eater`, `god-aurelia-dawn-forger`, `god-thalassa-abyss-tide`, `god-legendary-dragon`) with causal 5-tier chains (**Tier 5 Sealed God → Tier 4 MVP Apostles → Tier 3 Raid Bosses → Tier 2 Mini-Bosses → Tier 1 Minion Packs**), SVG hierarchy lines (`studioBossHierarchyChainOverlay`), and 1-click warp buttons to each entity's exact dungeon floor (`B1–B3` / `1F–3F`) or overland hunting habitat.
  - **Picture-in-Picture (PiP) World Radar Mini-Map (`D22` — `renderAtlasOverviewMiniMapPipSvg`):** Renders an interactive Overview World Radar Mini-Map inside zoomed Town Street Blueprints, Field Tactical Blueprints, Fortress Blueprints, Dungeon Floor Sub-Maps, and Step 4 Town/Hunting Area SVG views (`studioOverviewMiniMapPip`) with a glowing viewport indicator box, adjacent zone connection pins, and a 1-click **Expand to World Map (1.0×)** button.
  - **Interactive 3-Track Quest & Class Transfer Trial Map Overlay (`D23` — `quest_trial_chains`):** Covers **18 canonical quests** across all 3 Tracks (`main_story`, `class_transfer` Lv.20/40/76, `racial_heritage`) and all **6 Playable Races** (`Human`, `Lunar`, `Ogre/Orc`, `Dwarf`, `Dark-Lunar`, `Furral`), highlighting **Quest Giver Town → Hunting/Dungeon Objective (`B1–B3`/`1F–3F`) → Turn-In Town** on the World Map (`studioQuestTrialChainOverlay`) with 1-click warp buttons.
  - **Interactive Party & Farming Efficiency Heatmap / Grinding Calculator (`D24` — `farming_efficiency_profiles`):** Profiles all **40 combat zones** (`24` Field Hunting Areas + `16` Multi-Floor Dungeons) across 4 party modes (`solo_grinding`, `duo_spoil_scavenger`, `full_9p_aoe_party`, `clan_raid_force`) with XP/Adena per-hour indices, `No-Grade`..`S-Grade` spoil materials, pack density, elemental weaknesses, and World Map heatmap rings (`studioFarmingEfficiencyHeatmapOverlay`).
  - **Interactive Castle Siege, Territory Tax & Clan Hall Domain Overlay (`D25` — `castle_siege_domains`):** Covers all **8 Fortresses, Castles, Clan Halls & Harbor Strongholds** (`Capital_Citadel`, `Regional_Castle`, `Border_Fortress`, `Harbor_Stronghold`) with territory tax rates (`8%–15%`), siege windows, artifact altar & outer gate coordinates, manor specialty crops, and **Stronghold ➔ Vassal Towns & Taxed Hunting Grounds** SVG links (`studioCastleSiegeDomainOverlay`).
  - **Interactive World Boss & MVP Respawn Radar / Command-Channel Telemetry (`D26` — `world_boss_spawn_radar`):** Tracks **32 high-value bosses** (`16` Dungeon MVP Bosses on `B3`/`3F` + `16` Overland/Fortress Raid & Mini-Bosses) with respawn windows, command-channel party requirements, top reward drops, live radar statuses (`Window Open`, `Respawning Soon`, `Sanctum Active`), and 1-click teleport into any Boss Sanctum or overland raid coordinate (`studioWorldBossSpawnRadarOverlay`).
  - **Interactive Seven-Seals Dusk vs. Dawn Catacomb/Tower Competition & Mammon Rotation Overlay (`D27` — `seven_seals_competitions`):** Covers all **16 Multi-Floor Sanctums** (`8` Underground Seal Catacombs + `8` Vertical Ascendant Towers) across `Sign_of_Avarice`, `Sign_of_Gnosis`, and `Sign_of_Strife`, tracking `Lords_of_Dawn` vs. `Revolutionaries_of_Dusk` cabal control, Ancient Adena/hr rates, and 1-click teleport directly to the active dungeon floor (`B1–B3` / `1F–3F`) where `Blacksmith_of_Mammon` or `Merchant_of_Mammon` is stationed (`studioSevenSealsOverlay`).
  - **Interactive 15-Town Manor Seed/Crop & Caravan Trade Economy Overlay (`D28` — `manor_economy_routes`):** Links all **15 Towns** (`Town Manor Steward ➔ Hunting Field Crop Harvest ➔ Parent Stronghold Vault`) with daily crop quotas, caravan route risk tiers (`Low_Patrolled`, `Medium_Bandit_Road`, `High_Frontier_Ambush`), and Blacksmith Clan crafting material rewards (`Enria`, `Asofe`, `Thons`, `Oriharukon`, `Synthetic Cokes`) on the World Map (`studioManorEconomyOverlay`).
  - **Interactive Subclass, Noblesse & Grand Olympiad Monument Network Overlay (`D29` — `noblesse_olympiad_network`):** Covers **21 Heroic Awakening Nodes** (`15` Town Grand Olympiad Monuments of Heroes + `3` Subclass Mimir/Baium Sanctums on `B3`/`3F` + `3` Noblesse Barakiel/Lady-of-the-Lake Field Shrines) with Lv.75–78 ritual requirements, Heroic Circlet/Infinity weapon rewards, and 1-click teleport to any Town Hero Monument (`5.2×`), Field Shrine (`4.8×`), or Dungeon Sanctum Floor (`studioNoblesseOlympiadOverlay`).
  - **Interactive Inter-Continental Maritime Ship, Airship & Gatekeeper Transit Overlay (`D30` — `intercontinental_transit_lines`):** Maps **18 Inter-Continental Transit Corridors** (`6` Maritime Harbor Ship Routes + `6` Sky-Dock Brass Airship Routes + `6` Capital Gatekeeper Trunk Lines bridging `continent-01`, `continent-02`, and `continent-03`) with departure intervals, Adena ticket fares, vessel/gatekeeper stewards, animated World Map transit arcs (`studioIntercontinentalTransitOverlay`), and 1-click jump to Origin or Destination Docks/Towns.
  - **Interactive Soul Crystal (SA) Stage 1–13 Resonance & Boss Absorption Matrix (`D31` — `soul_crystal_resonance_stages`):** Covers **18 Soul Crystal Resonance Tiers** (`6` Crimson Red + `6` Verdant Green + `6` Azure Blue stages spanning `Stage 1` through `Stage 13`) across `C-Grade`, `B-Grade`, `A-Grade`, and `S-Grade` weapon unlocks (`Acumen`, `Focus`, `Haste`, `Health`, `Empower`, `Critical Stun`, `Guidance`), linking **Vendor Town Blacksmith ➔ Overland Absorption Field / Dungeon Boss Sanctum (`B2`/`B3`/`3F`)** on the World Map (`studioSoulCrystalResonanceOverlay`).
  - **Interactive Fishing Guild, Hot Springs & Luminous Night-Bait Sanctuary Overlay (`D32` — `fishing_guild_sanctuaries`):** Maps **16 Fishing & Thermal Sanctuaries** across all 3 continents (`6` Deep-Sea Maritime Harbor Piers + `5` Nocturnal Luminous Night-Bait Inland Lakes + `5` Thermal Hot Springs & Mineral Pools) with Fishing Guild Masters, recommended lures, active time windows (`24h All-Day`, `00:00–06:00 Nocturnal Luminous`, `Thermal Mist Cycle`), `Proof of Catching a Fish` Inventory/Warehouse expansion rewards, and Hot Springs Malaria/Cholera buffs (`studioFishingSanctuaryOverlay`).
  - **Interactive Cursed Weapon (Zariche & Akamanah), PK Karma Redemption & Open-World PvP Arena Overlay (`D33` — `cursed_weapon_pvp_hotspots`):** Maps **14 High-Stakes PvP & Karma Hotspots** (`5` Demonic Sword Zariche & Blood Sword Akamanah World-Broadcast Drop Zones + `5` Black Judge Sin-Eater & Lawless Floran-Style Zero-Guard Sanctuaries + `4` Coliseum / Monster Derby Track Free-PvP No-EXP-Loss Arenas) with 1-click jump to any Cursed Drop Field, Black Judge Camp, or PvP Arena (`studioCursedWeaponPvpOverlay`).
  - **Interactive Dimensional Rift, Four Sepulchers & Key-Gated Endgame Sanctum Matrix (`D34` — `dimensional_rift_sepulchers`):** Maps **16 Endgame Key-Gated & Dimensional Portals** across all 16 Multi-Floor Dungeons (`6` Dimensional Rift Tiers `Recruit..Hero` with 9m Room Shuffles + `6` Four Sepulchers & Imperial Mausoleum Halls with 50m `:55` Entry Cycles + `4` Key-Gated Pagan Temple / Nornil Chapel Sanctums) with 1-click teleport straight into the exact Dungeon Floor (`B1..B3` / `1F..3F`) (`studioDimensionalRiftOverlay`).
  - **Interactive Life Stone Weapon Augmentation & Symbol Maker Dye Parlor Matrix (`D35` — `weapon_augmentation_dye_hubs`):** Maps **15 Town Augmentation & Symbol Dye Hubs** across all 15 Towns (`Standard_Life_Stone`, `Mid_Grade_Life_Stone`, `High_Grade_Life_Stone`, `Top_Grade_Life_Stone`) with Blacksmith Refiner anvils, Symbol Maker tattoo parlors (`+4/-4` stat dye combos), `Gemstone D/C/B/A/S` fee tiers, `Item Skill` active/passive/chance rolls, and **Life Stone Drop Hunting Zone ➔ Town Refiner Anvil** World Map links (`studioWeaponAugmentationDyeOverlay`).
  - **Interactive Pet, Strider & Castle Wyvern Mount Sanctuary Overlay (`D36` — `companion_mount_sanctuaries`):** Maps **12 Companion & Mount Sanctuaries** across all 3 continents (`4` Town Pet Manager Kennels for Wolf/Fenrir, Buffalo, Kookaburra & Cougar + `4` Hatchling/Strider Evolution Sanctums with Elder Cronos & Fairy Mymyu + `4` Sovereign Castle/Citadel Wyvern Aerial Roosts) with 1-click jump to any Kennel, Strider Grove, or Castle Wyvern Roost (`studioCompanionMountOverlay`).
  - **Interactive Clan Reputation, Academy & Pledge Skill Altar Matrix (`D37` — `clan_reputation_academies`):** Maps **14 Clan Progression & Pledge Nodes** across all 3 continents (`5` Clan Academy Graduation & Clan Oath Armor Halls + `5` Clan Level 5..8 Ambition Quest Altars + `4` Apella Armor & Pledge Skill Sanctums) with CRP yields/costs, `Clan Imperium` Command Channel unlocks, and 1-click jump to any Town Grand Master Hall or Ambition Trial Field (`studioClanAcademyOverlay`).
  - **Interactive 24-Field Elemental Attribute & Ground Herb Sustainability Biome Overlay (`D38` — `field_herb_elemental_biomes`):** Maps all **24 Field Hunting Areas** across all 6 elemental attributes (`Fire`, `Water`, `Wind`, `Earth`, `Holy`, `Dark`), counter-element damage bonuses, ground herb drop tiers (`S_Tier_Zero_Downtime`, `A_Tier_Mystic_Mana_Rich`, `B_Tier_Party_Tough_Mobs`), signature herbs (`Herb of Life/Mana`, `Superior Giant's Herb`, `Herb of Mystic/Warrior`), and 1-click jump to any Field Tactical Blueprint (`studioHerbElementalBiomeOverlay`).
  - **Interactive 15-Town Soulshot/Spiritshot & Dwarven Private Manufacture Workshop Matrix (`D39` — `soulshot_workshop_plazas`):** Maps all **15 Town Dwarven Manufacture Plazas** (`6` `Starter_D_C_Plaza`, `5` `Regional_B_A_Workshop`, `4` `Capital_S_Grade_Master_Forge`) with Head Blacksmith NPCs, compressed Soulshot/Blessed Spiritshot grades, `60%/100%` weapon/armor recipe tiers, crystal-to-ore compression ratios, and **Recipe Spoil Hunting Zone ➔ Town Dwarven Manufacture Plaza** World Map links (`studioSoulshotWorkshopOverlay`).
  - **Interactive Territory Ward Relic & Fortress Giant's Codex Supply Matrix (`D40` — `territory_ward_supply_nodes`):** Maps all **16 Territory War & Fortress Supply Nodes** across the 8 Stronghold Domains (`8` `Sovereign_Territory_Ward` sanctums granting `+STR/+INT/+WIT/+DEX/+CON/+MEN` Ward Banners + `8` `Fortress_Codex_Supply_Vault` garrisons supplying `Knights' Epaulettes`, `Giant's Codex: Mastery/Discipline/Oblivion`, and `Blood Oaths`) with 1-click jump to any Stronghold Ward Altar or Vassal Supply Line (`studioTerritoryWardOverlay`).
  - **Interactive 12-Relic Epic Boss Jewelry & Status Resistance Matrix (`D41` — `epic_jewelry_sanctums`):** Maps all **12 Canonical Epic Boss Jewelry Relics** (`4` `Epic_Ring` + `4` `Epic_Earring` + `4` `Epic_Necklace` across `B-Grade`, `A-Grade`, and `S-Grade` sanctuaries — Queen Ant, Core, Baium, Beleth, Orfen, Zaken, Antharas, Lilith, Frintezza, Valakas, Anakim, and Freya analogs) with status resistance bonuses (`+Stun/Hold/Sleep/Bleed/Poison/Mental`), combat multipliers (`+15% Crit Damage`, `+4% Vampiric Rage`, `-10% Reuse Delay`), and 1-click teleport into the Boss Sanctum Floor (`B3`/`3F`) or Overland Lair (`studioEpicJewelryOverlay`).
  - **Interactive 15-Town Adventurer's Guide Buff, Shadow Weapon & Vitality Obelisk Matrix (`D42` — `adventurer_vitality_obelisks`):** Maps all **15 Town Adventurer's Guide & Vitality Rest Hubs** (`6` `Starter_Apprentice_Coupon_Hub`, `5` `Regional_Shadow_Weapon_Hub`, `4` `Capital_Stage4_Vitality_Sanctuary`) with `Lv.6–75` Support Buff Suites (`Wind Walk`, `Shield`, `Magic Barrier`, `Vampiric Rage`, `Acumen`, `Life Cubic`), `D/C/B-Grade` Shadow Weapon Coupons, Stage-4 (`+300% EXP`) Vitality rest recovery rates, and 1-click jump to any Town Obelisk (`studioVitalityObeliskOverlay`).
  - **Interactive 16-Set Armor Progression & Masterwork Foundation Forge Matrix (`D43` — `armor_set_masterwork_forges`):** Maps all **16 Canonical Armor Set & Masterwork Foundation Forges** (`6` `Heavy_Vanguard_Set` + `5` `Light_Skirmisher_Set` + `5` `Mystic_Robe_Set` spanning `C-Grade`, `B-Grade`, `A-Grade`, `S-Grade`, and `S80-Dynasty`) with full set bonuses, Foundation Rare item chaos bonuses, unseal Blacksmith NPCs, and **Key-Piece Drop Zone/Dungeon ➔ Town Masterwork Forge** World Map links (`studioArmorSetMasterworkOverlay`).
  - **Interactive 15-Portal Kamaloka, Pailaka & Seed Instance Conduit Matrix (`D44` — `kamaloka_pailaka_instances`):** Maps all **15 Town Pathfinder & Continent Instance Portals** (`6` `Kamaloka_Abyss_Hall` + `5` `Pailaka_Vitality_Trial` + `4` `Seed_Delusion_Conduit`) with Pathfinder Worker / Steward NPCs, level brackets (`Lv.23–85`), party size rules, daily `06:30 UTC` / heritage reset timers, `Essence of Kanabion` / Stage-4 Vitality / Dynasty rewards, and 1-click jump to any Pathfinder or Seed Conduit (`studioKamalokaPailakaOverlay`).
  - **Interactive 16-Sanctum Forgotten Scroll, Ancient Tome & Lv.81–83 Skill Mastery Matrix (`D45` — `forgotten_scroll_skill_sanctums`):** Maps all **16 High-Level Skill Mastery Sanctums** (`6` `Martial_Will_Scroll` + `5` `Arcane_Enlightenment_Scroll` + `5` `Ancient_Tome_Codex_Sanctum` across Multi-Floor Dungeons & High-Level Fields) with `Lv.76–83` skill unlocks (`Fighter's Will`, `Archer's Will`, `Sixth Sense`, `Enlightenment`, `Meteor / Star Fall`, `Sublime Self-Sacrifice`, `Giant's Codex: Mastery/Discipline/Oblivion`, `Improve Combat/Magic`), guardian mob drop rates, and **Drop Sanctum/Dungeon ➔ Trainer Town Guild** World Map links (`studioForgottenScrollOverlay`).
  - **Interactive 14-Node Elemental Attribute Stone/Crystal (`150/300`) & Caravan Quarry Matrix (`D46` — `elemental_stone_caravan_quarries`):** Maps all **14 Endgame Attribute & Caravan Quarries** (`6` `Elemental_Stone_Quarry_150` + `6` `Elemental_Crystal_Sanctum_300` + `2` `Caravan_Trust_Oasis` spanning `Fire`, `Water`, `Wind`, `Earth`, `Holy`, `Dark`, and `Omni_Caravan`) with `0->150` Stone / `150->300` Crystal caps, Attribute Master `Yin`/`Yang` synthesis, Hellbound `Stage 1->11` Caravan Certificates, and 1-click jump to any Quarry, Dungeon Floor, or Caravan Oasis (`studioElementalQuarryOverlay`).
  - **Interactive 16-Estate Clan Hall Auction & Siege Chateau Real-Estate Matrix (`D47` — `clan_hall_auction_estates`):** Maps all **16 Clan Hall Real-Estate Sanctuaries** (`10` `Town_Luxury_Auction_Hall` across `B_Grade_Provincial` & `A_Grade_Metropolitan` towns + `6` `Contested_Siege_Chateau` across `S_Grade_Sovereign_Chateau` siege strongholds — Bandit Stronghold, Devastated Castle, Fortress of the Dead, Wild Beast Reserve, Rainbow Springs Chateau, and Fortress of Resistance) with Adena auction bids/weekly rent, bi-weekly siege/tournament rules, Stage 5–8 Support Magic + `30%–50% EXP` Resurrection facilities, Elixir/Blessed Escape production, and 1-click jump to any Town Auction Hall or Contested Siege Chateau (`studioClanHallAuctionOverlay`).
  - **Interactive 15-Sanctum Transformation Sealbook, Talisman & Agathion Summon Matrix (`D48` — `transformation_talisman_sanctums`):** Maps all **15 Transformation, Talisman & Agathion Sanctums** (`6` `Avant_Garde_Transformation_Sanctum` for Wizard Avant-Garde, `Lv.80` Divine Subclass Sealbooks, Anakim/Lilith/Zaken/Demon Prince boss morphs & Gracia Aurabird flight + `5` `Epaulette_Talisman_Vault` for `Blue Talisman of Divine Protection`, `Red Talisman of Maximum Clarity / Life Force`, `Yellow Talisman of Speed`, `Black Talisman of Vocalization` & 4-Slot Mithril Bracelets + `4` `Agathion_Bracelet_Altar` for Little Angel/Devil, Castle/Fortress Sovereign, Rainbow Clan Hall & Gracia Star Stone Fairy Agathions) with 1-click teleport to any Town/Fortress Steward or Boss Sanctum Floor (`studioTransformationTalismanOverlay`).
  - **Interactive 15-Town Iron Gate Warehouse, Clan Vault & Freight Logistics Network (`D49` — `warehouse_freight_vaults`):** Maps all **15 Town Iron Gate Guild Warehouse & Dimensional Broker Hubs** (`6` `Starter_Iron_Gate_Vault`, `5` `Regional_Freight_Depot`, `4` `Capital_Dimensional_Broker`) with Warehouse Keeper & Freightman NPCs, Private/Clan slot capacities (`+64` Proof of Catching a Fish expansions), `800–1,000 Adena/slot` Account Freight corridors, Dimensional Merchant `Neolithic Crystal` Masterwork upgrades, Wondrous Cubic fragment polish, and **Town Warehouse ➔ Freight Partner Town** World Map lines (`studioWarehouseFreightOverlay`).
  - **Interactive 18-Checkpoint Master Cartographic Tour & 50-Dimension Studio Inspector (`D50` — `atlas_master_telemetry_checkpoints`):** Provides an **18-Step Guided Council Inspection Tour** (`6` `Race_Origin_To_Awakening` checkpoints for Steps `1–6` + `6` `Town_Blueprint_And_Economy` checkpoints for Steps `7–12` + `6` `Multi_Floor_Dungeon_Sanctum` checkpoints for Steps `13–18`) cross-verifying all `D1–D50` dimensions with 1-click guided camera jump across Overland Spawns, `#1..#12` Town Street Blueprints, and `B1–B3` / `1F–3F` Boss Sanctums (`studioMasterTourOverlay`).
  - **Interactive 15-Town Festival of Darkness & Oracle of Dawn/Dusk Party Altar Matrix (`D51` — `festival_of_darkness_oracles`):** Maps all **15 Town Oracle of Dawn & Oracle of Dusk Festival Sanctuaries** (`5` `Oracle_of_Dawn_Sanctuary` + `5` `Oracle_of_Dusk_Sanctuary` + `5` `High_Bracket_Blood_Offering_Altar`) with Priest/Priestess NPCs, 5 level brackets (`Under Lv.32` .. `No-Limit Lv.65–85`), Blue/Green/Red Seal Stone entry fees, target `Blood Offering` party scores (`1,250..5,400`), `Ancient Adena` cabal jackpot pools, `18-Minute` Festival Witch party-member sacrifice escalation mechanics, and 1-click jump to any Town Oracle Priest (`studioFestivalOracleOverlay`).
  - **Interactive 12-Node Luxury Boutique & Black Marketeer of Mammon Exchange Matrix (`D52` — `luxury_black_market_boutiques`):** Maps all **12 High-Society & Smuggler Exchange Nodes** (`4` `Crystal_Luxury_Armory` for Alexandria-style `Crystal: C/B/A/S-Grade` weapon/armor exchanges + `4` `Black_Marketeer_of_Mammon` `20:00–24:00` night smuggler alleys for `Ancient Adena ⇄ Adena` liquidity & Blank Scrolls + `4` `Couture_Emporium` salons for Galladucci `Formal Wear Wedding Tuxedo`, `Olf's T-Shirt`, and noble headpieces) with 1-click jump to any Town Luxury Boutique or Harbor Smuggler Alley (`studioLuxuryBlackMarketOverlay`).
  - **Interactive 14-Node Factional Alliance War (`Stage 1–5`) & Totem Raid Altar Matrix (`D53` — `faction_alliance_war_camps`):** Maps all **14 Factional Alliance & Totem War Nodes** (`5` `Vanguard_Orc_Alliance_Outpost` for Ketra/Turek/Breka Orc alliances + `5` `Shaman_Silenos_Alliance_Stronghold` for Varka/Maille/Oel Mahum Shaman strongholds + `4` `Totem_Spirit_Raid_Altar` for `Soul of Water Ashutar`, `Soul of Fire Nastron`, `Ketra's Hero Hekaton`, and `Varka's Hero Shadith`) with `Alliance Stage 1–5` Soldier/Officer/Captain badge tiers, `Divine Stone of Wisdom` & `Stage 5 Brown/Feather Pouch S-Grade 60% Recipe` rewards, instant `-1/-2 Stage` betrayal penalties, and **Allied Camp ➔ Rival War Camp / Totem Altar** World Map vectors (`studioFactionAllianceOverlay`).
  - **Interactive 12-Node Monster Derby Race Track, Coin of Magic & Kratei's Cube Plaza Matrix (`D54` — `monster_track_fantasy_plazas`):** Maps all **12 Recreational Minigame & Collector Plazas** (`4` `Monster_Derby_Race_Track` 8-lane parimutuel stadiums + `4` `Coin_of_Magic_Collector_Lodge` numismatic guilds for Sorint/Hagger/Collob Grade 1–3 Royal Memberships & `A/B-Grade` weapon recipes + `4` `Kratei_Cube_Fantasy_Arena` 20-minute PvP/PvE Cube, 6v6 Handy's Block Checker, 7-Party Underground Coliseum & 9v9 Aerial Cleft arenas) with 1-click jump to any Derby Track, Collector Lodge, or Kratei's Cube Arena (`studioFantasyPlazaOverlay`).
  - **Interactive 15-Town Hero Weapon (`Infinity Armaments`) & Olympiad Token Exchange Matrix (`D55` — `olympiad_hero_weapon_exchanges`):** Maps all **15 Town Olympiad Manager & Monument of Heroes Exchanges** (`5` `Martial_Infinity_Armory` + `5` `Arcane_Infinity_Sanctum` + `5` `Olympiad_Token_Codex_Exchange`) with `Infinity Blade/Cleaver/Axe/Spear/Fang/Stinger/Bow/Scepter/Rod/Rapier/Sword/Shooter` armaments, `Wings of Destiny Circlet`, `Heroic Miracle/Berserker/Valor/Grandeur/Dread` skills, `Olympiad Token` / `Noblesse Gate Pass` exchanges for `Giant's Codex: Mastery/Discipline/Oblivion`, `Lv.81–83 Forgotten Scrolls` & `Ring/Earring/Necklace of Olympiad`, `18:00–24:00` 9-match weekly quota rules, and 1-click jump to any Town Olympiad Monument (`studioHeroWeaponExchangeOverlay`).
  - **Interactive 16-Zone Treasure Chest Lockpick (`Grade 1–8 Keys`) & Mimic Cache Matrix (`D56` — `treasure_chest_lockpick_grounds`):** Maps all **16 Treasure Chest & Lockpick Grounds** (`6` `Overland_Pirate_Bandit_Cache` + `5` `Underground_Catacomb_Vault` + `5` `Tower_Sanctum_Coffer_Room`) with `Lv.21–85` chest level brackets, `Deluxe Chest Key Grade 2–8` & `Rogue/Treasure Hunter/Fortune Seeker Unlock Lv.3–15` / `Maestro Key of Enigma` requirements, `True Treasure Chest vs. Explosive Mimic` ratios, `Blessed Scroll: Enchant Weapon/Armor (D..S-Grade)` & `Top-Grade Life Stone` jackpot drops, and 1-click jump to any Overland Cache or Dungeon Coffer Floor (`B2`/`B3`/`2F`/`3F`) (`studioTreasureChestOverlay`).
  - **Interactive 12-Node Clan Airship Summon Dock, Star Stone Extraction & Aerial Raid Matrix (`D57` — `aerial_star_stone_docks`):** Maps all **12 Aerial & Star Stone Nodes** (`4` `Clan_Airship_Summon_Dock` + `4` `Star_Stone_Extraction_Field` + `4` `Aerial_Raid_Corridor` across the 3 continents) with Engineer Lekon / Admiral Keucereus / Magister Dilios / Broker Kutran NPCs, `Airship Summon License` & `5 Energy Star Stones` summon fuel rules, `Extracted Red/Blue/Green Star Stone` (`Collection Skill Lv.1–3`) aerial veins, `Spellbook: Aurabird Falcon / Owl / Final Flying Form` transformations, `Icarus S80` / `Vesper` / `150->300 Attribute Crystal` rewards, and **Airship Summon Dock ➔ Star Stone Field / Aerial Raid Corridor** World Map paths (`studioAerialStarStoneOverlay`).
  - **Interactive 14-Node Weaver Olf Mithril Belt & Sovereign Boss/Castle Cloak Matrix (`D58` — `belt_cloak_weaver_hubs`):** Maps all **14 Belt Weaver & Cloak Sanctums** (`5` `Weaver_Olf_Belt_Loom` for Weaver Olf Adams / Kanore `C/B/A/S-Grade` Leather/Cloth/Iron/Mithril Belts with `Low/Regular/High/Top-Grade Magic Pouch (+36 Inventory Slots)`, `Magic Pin (+8,000 Weight Limit)`, `Magic Ornament (+5% PvP Attack / +6% PvP Defense)`, `Magic Rune Clip` & `+10 Olf's T-Shirt` + `5` `Sovereign_Boss_Cloak_Sanctum` for `Holy Spirit's / Soul Cloak of Zaken, Freya, Frintezza, Antharas, Valakas & Kimerian` (`+26–32 P.Def`, `+15–35 Elemental Def`) + `4` `Castle_Knight_Cloak_Armory` for `Knight's Cloak of Light / Darkness` & S80/S84 Cloak slot unlockers) with 1-click jump to any Town Weaver, Castle Armory, or Boss Cloak Sanctum (`studioBeltCloakWeaverOverlay`).
  - **Interactive 12-Sanctuary Wedding Cathedral, Formal Wear & Couple Teleport Matrix (`D59` — `wedding_ceremony_cathedrals`):** Maps all **12 Wedding & Ceremonial Sanctuaries** (`4` `Grand_Wedding_Cathedral` officiated by Wedding Manager Andromeda & High Priests across Aden, Giran, Heine & Rune + `4` `Formal_Wear_Couture_Tailor` salons for Trader Alexis / Maid Leikar `Make A Sewing Kit` Formal Wear Tuxedos/Bridal Gowns, Galladucci Veils & Chef Jeremy's Banquet Wine + `4` `Bridal_Procession_Garden` scenic pavilions across the Elven Mother Tree, Neutral Zone Lotus Promenade, Floran Rose Terrace & Enchanted Waterfall) unlocking `/coupleteleport` (`30s` partner warp across all 24 Fields & 15 Towns), `Salvation Bow & Cupid's Heart Arrows`, and 1-click jump to any Town Cathedral (`5.2×`) or Bridal Garden (`4.8×`) (`studioWeddingCathedralOverlay`).
  - **Interactive 18-Benchmark 6-Role Studio Council 60-Dimension Audit Matrix (`D60` — `studio_council_audit_benchmarks`):** Maps **18 Cross-Verified Studio Council Exemplars** (`3` benchmarks for each of the 6 Studio Council Roles: `Product_Owner`, `Game_Designer_Lead`, `Player_Growth_Path_Designer`, `Game_Story_Designer`, `Monster_And_Mob_Designer`, and `Lead_Systems_Map_Architect`) auditing all `D1–D60` dimensions (`100.0/100`) and all 7 MDA Experience Pillars (`Aesthetic`, `Continuity`, `Narrative`, `Challenge`, `Discovery`, `Fantasy`, `Submission`) with 1-click jump to any Exemplar Town, Field, Fortress, or Multi-Floor Dungeon Sanctum (`studioCouncilBenchmarkOverlay`).
  - **Interactive 14-Node Continental Seed Cycle (`Stage 1–5` Ekimus/Tiat State Machine) Matrix (`D61` — `continental_seed_cycles`):** Maps all **14 Continental Seed Stage & Energy Compression Well Nodes** (`5` `Seed_of_Infinity_Stage` for `Stage 1: Hall of Suffering Assault`, `Stage 2: Hall of Erosion Conquest`, `Stage 3: Heart of Immortality (Ekimus Sanctum)`, `Stage 4: Defense of the Seed` & `Stage 5: Free Attribute Crystal Harvest` + `5` `Seed_of_Destruction_Stage` for `Stage 1: Dragonkin Outer Gate Breach`, `Stage 2: Central Square Obelisk Conquest`, `Stage 3: Throne of Darkness (Tiat Sanctum)`, `Stage 4: Defense of the Destruction Throne` & `Stage 5: Free Attribute Crystal Harvest` + `4` `Energy_Compression_Well` condensers across Starfall Haven, Glaze-Barge Airship Dock, Seed of Annihilation Bistakon/Reptilikon/Cokrakon & Inductor Switchyard) with Officer Tepios / Sergeant Allenos / Mouth of Ekimus NPCs, party/command-channel trigger quotas, `Vesper / Vorpal / Icarus S80–S84` & `150–300 Elemental Crystal` rewards, and 1-click jump to any Seed Sanctum Floor (`B1–B3` / `1F–3F`) or Energy Well (`studioContinentalSeedOverlay`).
  - **Interactive 12-Arena Underground Coliseum (`Party-vs-Party`) & Clan Tournament Matrix (`D62` — `party_coliseum_tournaments`):** Maps all **12 Competitive Party & Clan Tournament Rings** (`5` `Underground_Coliseum_Bracket` 9v9 King-of-the-Hill rings across `Lv.40–49`, `Lv.50–59`, `Lv.60–69`, `Lv.70–79` & `No-Limit Lv.80–85 Sovereign Bracket` + `4` `Clan_War_Tournament_Ring` arenas for Rainbow Springs Enraged Gourd, Bandit Stronghold 5-Clan Preliminaries, Wild Beast Reserve Obelisk Elimination & 9v9 Aerial Cleft Sky-Coliseum + `3` `Royal_Fame_Exhibition_Arena` stadiums in Aden, Gludin & Heine) with Central Life Tower `30s` auto-resurrection mechanics, `+400..+1,500 Individual Fame / CRP` streak payouts, `Circlet of Party Supremacy`, and 1-click jump to any Coliseum or Clan Tournament Ring (`studioColiseumTournamentOverlay`).
  - **Interactive 14-Sanctum Elemental Jewel, Raid Rune Stone & Ancient Giant's Relic Matrix (`D63` — `elemental_jewel_rune_sanctums`):** Maps all **14 High-Awakening Relic & Elemental Jewel Sanctums** (`6` `Elemental_Jewel_Forge` sanctums for `Fire / Water / Wind / Earth / Holy / Dark Elemental Jewels` unlocking `300+` dual-attribute weapon synergy + `4` `Raid_Rune_Stone_Altar` sanctums for `Sovereign Rune Stones` unlocking `Lv.83` ultimate class awakening skills (`Flame Icon`, `Spirit of Shilen`, `Lucky Strike`, `Sublime Self-Sacrifice`, `Counter Critical`) + `4` `Ancient_Giants_Relic_Vault` archives for `Ancient Giant's Codex: Mastery/Oblivion/Discipline` & `Lesser Giant's Essence` safe `+16..+30` skill enchanting) with 1-click jump to any Dungeon Sanctum Floor (`B3`/`3F`) or Overland Forge (`studioElementalJewelOverlay`).
  - **Interactive 15-Town Reputation Manager (`Rapidus / Scipio`) Fame & PvP Infusion Monument Matrix (`D64` — `reputation_fame_monuments`):** Maps all **15 Town Reputation Manager Fame & PvP Infusion Monuments** (`5` `PvP_Weapon_Infusion_Obelisk` + `5` `PvP_Armor_Mirage_Obelisk` + `5` `PK_Pardon_And_CRP_Monument`) with Reputation Manager `Rapidus` & `Scipio` NPCs, Castle/Fortress Siege (`+125/+31 Fame/5m`), Territory War (`+375 Fame/5m`) & Underground Coliseum earning sources, `PvP Weapon Might/Cancel/Haste`, `PvP Light Armor Mirage`, `PvP Heavy/Robe Defense Seals`, `-1 PK Count per 5,000 Fame` pardons, Clan Reputation Point (`CRP`) conversions, and 1-click jump to any Town Fame Monument (`5.2×`) (`studioFameMonumentOverlay`).
  - **Complete 20-Dimension (`D1–D20`), 22-Dimension (`D1–D22`), 24-Dimension (`D1–D24`), 26-Dimension (`D1–D26`), 28-Dimension (`D1–D28`), 30-Dimension (`D1–D30`), 32-Dimension (`D1–D32`), 34-Dimension (`D1–D34`), 36-Dimension (`D1–D36`), 38-Dimension (`D1–D38`), 40-Dimension (`D1–D40`), 42-Dimension (`D1–D42`), 44-Dimension (`D1–D44`), 46-Dimension (`D1–D46`), 48-Dimension (`D1–D48`), 50-Dimension (`D1–D50`), 52-Dimension (`D1–D52`), 54-Dimension (`D1–D54`), 56-Dimension (`D1–D56`), 58-Dimension (`D1–D58`), 60-Dimension (`D1–D60`), 62-Dimension (`D1–D62`) & 64-Dimension (`D1–D64`) Score Matrix (`100.0/100`):**
    - `D1` 6-Race Spawns · `D2` 15 Town Street Blueprints & 1..12 NPCs · `D3` 16 Multi-Floor Dungeons (`B1–B3` / `1F–3F`) · `D4` Monster/Mini-Boss/Raid/MVP Spawn Tiers · `D5` Connected Travel Highways & Anti-Clutter · `D6` 7 MDA Experience Pillars · `D7` 24 Field Tactical Blueprints · `D8` 8 Harbor/ClanHall/Fortress Blueprints · `D9` 6-Race Growth Routes (Stages `A..L`) · `D10` NPC Shop & `+1..+15` Refinement Catalogs · `D11` 4 Town Layout Archetypes · `D12` Dungeon Vertical Cutaway Elevations · `D13` Instant Omni-Search & Quick-Jump Index · `D14` Spawn & Refinement-Spoil Matrix · `D15` 11 Per-Archetype Raster Plates · `D16` Unified 63-Zone Map Directory · `D17` BFS Travel Route & Gatekeeper Calculator · `D18` Clickable Dungeon Chamber Inspector & Telemetry · `D19` 6-Grade `+1..+15` Refinement & Spoil Source Locator · `D20` Bidirectional Studio ⇄ Atlas Sync & Documentation · `D21` 6-God 5-Tier Boss Power Hierarchy Chains · `D22` Picture-in-Picture (PiP) World Radar Mini-Map · `D23` 3-Track Quest & Class Transfer Trial Chains · `D24` 40-Zone Party & Farming Efficiency Heatmap · `D25` 8 Castle Siege & Territory Tax Domains · `D26` 32-Boss World Raid & MVP Respawn Radar · `D27` 16-Sanctum Seven-Seals & Mammon Rotation · `D28` 15-Town Manor Seed & Caravan Economy · `D29` 21-Node Subclass, Noblesse & Olympiad Network · `D30` 18-Route Inter-Continental Ship, Airship & Gatekeeper Transit · `D31` 18-Stage Soul Crystal (SA) Stage 1–13 Resonance & Boss Absorption · `D32` 16-Sanctuary Fishing Guild, Hot Springs & Luminous Night-Bait Network · `D33` 14-Hotspot Cursed Weapon, PK Karma Sanctuary & PvP Arena Overlay · `D34` 16-Portal Dimensional Rift, Four Sepulchers & Key-Gated Chapel Matrix · `D35` 15-Town Life Stone Weapon Augmentation & Symbol Dye Parlor Matrix · `D36` 12-Sanctuary Pet, Strider & Castle Wyvern Mount Overlay · `D37` 14-Node Clan Reputation, Academy & Pledge Skill Altar Matrix · `D38` 24-Field Elemental Attribute & Ground Herb Sustainability Biome Overlay · `D39` 15-Town Soulshot/Spiritshot & Dwarven Private Manufacture Workshop Matrix · `D40` 16-Node Territory Ward Relic & Fortress Giant's Codex Supply Matrix · `D41` 12-Relic Epic Boss Jewelry & Status Resistance Matrix · `D42` 15-Town Adventurer's Guide Buff, Shadow Weapon & Vitality Obelisk Matrix · `D43` 16-Set Armor Progression & Masterwork Foundation Forge Matrix · `D44` 15-Portal Kamaloka, Pailaka & Seed Instance Conduit Matrix · `D45` 16-Sanctum Forgotten Scroll, Ancient Tome & Lv.81–83 Skill Mastery Matrix · `D46` 14-Node Elemental Attribute Stone/Crystal (`150/300`) & Caravan Quarry Matrix · `D47` 16-Estate Clan Hall Auction & Siege Chateau Real-Estate Matrix · `D48` 15-Sanctum Transformation Sealbook, Talisman & Agathion Summon Matrix · `D49` 15-Town Iron Gate Warehouse, Clan Vault & Freight Logistics Network · `D50` 18-Checkpoint Master Cartographic Tour & 50-Dimension Studio Inspector · `D51` 15-Town Festival of Darkness & Oracle of Dawn/Dusk Party Altar Matrix · `D52` 12-Node Luxury Boutique & Black Marketeer of Mammon Exchange Matrix · `D53` 14-Node Factional Alliance War (`Stage 1–5`) & Totem Raid Altar Matrix · `D54` 12-Node Monster Derby Race Track, Coin of Magic & Kratei's Cube Plaza Matrix · `D55` 15-Town Hero Weapon (`Infinity Armaments`) & Olympiad Token Exchange Matrix · `D56` 16-Zone Treasure Chest Lockpick (`Grade 1–8 Keys`) & Mimic Cache Matrix · `D57` 12-Node Clan Airship Summon Dock, Star Stone Extraction & Aerial Raid Matrix · `D58` 14-Node Weaver Olf Mithril Belt & Sovereign Boss/Castle Cloak Matrix · `D59` 12-Sanctuary Wedding Cathedral, Formal Wear & Couple Teleport Matrix · `D60` 18-Benchmark 6-Role Studio Council 60-Dimension Audit Matrix · `D61` 14-Node Continental Seed Cycle (`Stage 1–5` Ekimus/Tiat State Machine) Matrix · `D62` 12-Arena Underground Coliseum (`Party-vs-Party`) & Clan Tournament Matrix · `D63` 14-Sanctum Elemental Jewel, Raid Rune Stone & Ancient Giant's Relic Matrix · `D64` 15-Town Reputation Manager (`Rapidus / Scipio`) Fame & PvP Infusion Monument Matrix.
- **6-Role Studio Council (`.claude/agents/`) & Deterministic Multi-Iteration Loop:**
  - **Council Personas:** `studio-product-owner.md`, `studio-cartographer.md`, `studio-lore-architect.md`, `studio-dungeon-architect.md`, `studio-combat-economist.md`, and `studio-ux-director.md`.
  - **Governance & Iteration CLI:**
    ```bash
    # Run 10-gate World Governance & JSON Schema Draft 2020-12 check (GOV-01..GOV-10)
    python3 scripts/studio_world_governance.py --check

    # Audit 20-Dimension (D1–D20 = 100.0/100) / 7-MDA-pillar scores or auto-expand next wave
    python3 scripts/run_atlas_iteration_loop.py --auto-expand-next-wave

    # Launch the World Studio & Catalog Explorer on :8788
    python3 scripts/catalog_explorer_web.py --port 8788
    ```

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- Rust 1.98+ & Cargo (`~/.cargo/bin`)
- .NET 8 SDK & Xcode 16+ (for Godot C# iOS Client)

### 1. Start High-Density Rust Game & Meta Server (`server-rs`)
```bash
cd server-rs
export NAKAMA_SERVER_KEY="defaultkey"
export META_DB_PATH="./data/meta.db"       # optional: omit for in-memory store
export META_BIND_ADDR="0.0.0.0:7350"       # optional: secondary Nakama /v2/* HTTP port
export AGONES_ENABLED="false"
cargo run --release
```

### 2. Start Legacy Colyseus Game Server (Optional)
```bash
cd colyseus-server
npm install
npm run dev
```

### 3. Start React Client
```bash
cd client/react-client
npm install
npm start
```
Play the game at `http://localhost:3001` (Use WASD/Arrows to move).

### 4. Build & Run Godot Mobile MMORPG Client (iOS / iPad)
```bash
# 1. Export Godot PCK pack
godot --headless --path game-client --export-pack "iOS" game-client/builds/AtlasWorld.pck

# 2. Publish NativeAOT dylib for arm64
dotnet publish game-client/GameClient.csproj -c ExportRelease-ios-arm64 -r ios-arm64

# 3. Build & Deploy via Xcode / devicectl
xcodebuild -project game-client/builds/ios/AtlasWorld.xcodeproj -scheme AtlasWorld -destination 'id=<DEVICE_UUID>' build
xcrun devicectl device install app --device <DEVICE_UUID> <PATH_TO_APP>/AtlasWorld.app
xcrun devicectl device process launch --device <DEVICE_UUID> com.atlasworld.client
```

---

## 🔗 Main Service Endpoints

| Service | Endpoint | Purpose |
| ---| --- | --- |
| **server-rs WebSocket & Meta API** | `ws://localhost:2567/ws` / `http://localhost:2567/v2/*` | Binary FlatBuffers WebSocket + Nakama `/v2/*` HTTP API |
| **Secondary Meta HTTP Listener** | `http://localhost:7350/v2/*` | Optional (`META_BIND_ADDR=0.0.0.0:7350`) drop-in Nakama HTTP port |
| **Colyseus Server (WS)** | `ws://localhost:2567/game` | Legacy binary websocket connection |
| **REST API (Static Data)** | `http://localhost:2567/api` | Mob types, configs, stats |
| **Metrics (Prometheus)** | `http://localhost:2567/metrics`| Live server tick & entity diagnostic metrics |
| **Dashboards (Grafana)** | `http://localhost:3000` | Analytics dashboards (admin/admin) |
| **React Interface** | `http://localhost:3001` | Browser-based generic client |
| **World Studio & Semantic-Zoom Atlas** | `http://localhost:8788` | Interactive 4-Layer World Studio, 15 Town Street Blueprints & 16 Multi-Floor Dungeon Sub-Maps |

---

## 📁 Project Structure

| Path | Description |
| ---| --- |
| `.cursor/` | Project rules and roadmap implementation plans. |
| `docs/` | Architecture specs and API documentation. |
| `game-client/` | Godot 4.7 C# NativeAOT Mobile MMORPG client (scenes, scripts, shaders, assets). |
| `game-client/src/UI/Widgets/` | Ragnarok-style UI components: `PlayerFrame`, `TopBar`, `ChatBox`, `WardrobeModal`, `MobileControlsOverlay`. |
| `server-rs/` | Authoritative Rust ECS simulation engine + Native Rust Meta & Persistence Engine (`server-rs/src/meta/`). |
| `colyseus-server/` | Legacy Node.js authoritative game server. |
| `client/react-client/` | Web-based client implementation for quick prototyping. |
| `monitoring/` | Prometheus & Grafana configuration stacks. |
| `docker-compose.yml` | Complete local orchestration setup. |

---

## 📜 Technical Data Contracts

### Static World Bundles (Loaded at Boot)
- `config.json` - Map scale & layers.
- `level-colliders.json` - Static Planck.js physics bodies (boxes, circles, polygons).
- `slopes.json` - Movement speed modifiers (gradient, upMul/downMul).
- `portals.json` - Floor-changing trigger zones.

### Network Protocol (FlatBuffers Binary Delta Stream — Epic E-001 Slice 3)
The real-time game state replication protocol uses schema-compiled Google FlatBuffers (`schemas/game_protocol.fbs`) for zero-allocation serialization in Rust and sub-millisecond decoding in TypeScript.
1. **Server -> Client (`WorldSnapshot`):**
   - Compact table containing `tick: uint32`, `server_time_ms: uint64`, `entities: [EntityDelta]`, and `removed_ids: [uint32]`.
   - Each `EntityDelta` stores packed `Vec2` positions, velocities, current/max health, and `state_flags` bitmask.
   - **Wire Bandwidth:** Average delta size is $39.87\text{ B}$ per entity. Typical AOI view (15 entities) consumes only $216\text{ B}$ per tick ($4.22\text{ KB/s}$ at $20\text{ Hz}$), safely inside the $< 5\text{ KB/s}$ wire budget.
2. **Client -> Server (`ClientInput`):**
   - Binary input frame (`client_tick`, `move_x`, `move_y`, `attack`, `skill_slot`, `target_id`).
3. **Cross-Language Validation:**
   - Serialized in Rust via `SnapshotBuilder` (`server-rs/src/protocol/`).
   - Decoded in TypeScript via `BinaryDeltaDecoder` (`contracts/src/protocol/BinaryDeltaDecoder.ts`).
   - Bit-parity asserted end-to-end via `protocol_roundtrip.rs` and `protocol-roundtrip.test.ts`.

---

## 🧪 Development Workflow

### Git / Deployment Rules
- Create feature branch from `main`. Write tests.
- CI pipeline triggers on Pull Request.
- `main` deploys to Production/Staging.

### Required Code Quality & Testing Gates
- TypeScript **Strict Mode** only.
- Passing `ESLint` and `Prettier` configurations (`npm run format`).
- Unit & E2E Quality Gates (`npm run test:unit`, `npm run test:coverage:gate`, `npm run test:e2e`).
- Precheck Gate: `./scripts/precheck.sh` enforces coverage thresholds (55% branch, 70% functions, 70% lines, 70% statements; 80%+ on core interest/time modules), linter, contracts, and full test suites.
- **Deterministic Simulation Oracle:** `colyseus-server/src/tests/fixtures/golden_sim_trace_1000.json` records 1,000 ticks of authoritative simulation driven by `SimClock` and Mulberry32 PRNG. Verified by `npm test -- src/tests/sim-trace-determinism.test.ts` to ensure zero drift during the high-density Rust server migration (Epic `E-001`).
- Commit to the 2.5D Physical limitations (never blindly trust Client elevation inputs, always audit slope coordinates).

---

## 🎛 Configuration & Environment Variables

| Variable | Default / Example | Purpose |
| ---| --- | --- |
| `MAP_KEY` | `TowerF5` | Name of the instance map |
| `CAPACITY` | `300` | Limit of connections before rejecting |
| `META_DB_PATH` | `./data/meta.db` (optional) | SQLite WAL file path for `RustMetaEngine` (uses `InMemoryMetaStore` when unset) |
| `META_POSTGRES_URL` | `postgres://...` (optional) | Postgres connection URL for multi-pod `PostgresMetaStore` |
| `META_BIND_ADDR` | `0.0.0.0:7350` (optional) | Secondary TCP listener serving Nakama `/v2/*` HTTP routes |
| `NAKAMA_SERVER_KEY` | `defaultkey` | Shared secret for Basic device auth and JWT fallback |
| `NAKAMA_HTTP_KEY` | `atlas_dev_http_key` | Shared secret for S2S `/v2/rpc/*?http_key=` calls |
| `PORT` | `2567` | Game WebSocket & primary HTTP gateway port |
| `AGONES_ENABLED` | `false` (local) / `true` (prod) | Whether to connect to Agones Kubernetes sidecar |
| `AGONES_SDK_PORT` | `9357` | Port for the Agones SDK sidecar gRPC/HTTP interface |

**Built for performance, scaled for players.** 🎯
