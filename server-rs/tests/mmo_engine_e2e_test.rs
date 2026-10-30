//! End-to-End (E2E) Integration Test Suite for Pure Rust MMORPG Engine.
//!
//! Validates the entire multi-epic chain:
//! - Epic 1 & 2: Multi-Race Roster, 6-Stat Primary Attributes (STR, AGI, INT, VIT, DEX, LUK), +20 Enchanting & Sockets with Special Abilities.
//! - Epic 3: Buff Containers with Standard (24) and Song/Dance (12) slots + Spatial Aura Propagation.
//! - Epic 4: In-World Spatial Dungeon Portal Trigger in Bevy ECS simulation.
//! - Epic 5: Agones Dynamic Match Allocation & Atomic Session Room Migration.
//! - Epic 6: In-Dungeon Boss Encounter Lifecycle with 50% HP Phase 2 Transition, Enrage Timer, and RO/L2 Weighted MVP Reward Distribution.

use bevy_ecs::prelude::*;
use futures_util::StreamExt;
use reqwest::Client;
use std::sync::Arc;
use tokio_tungstenite::connect_async;

use server_rs::auth::AuthGuard;
use server_rs::combat::buffs::{ActiveBuff, BuffCategory, BuffContainer};
use server_rs::content::derived_stats_with_race;
use server_rs::content::enchantment::{
    attempt_high_tier_enchant, compute_enchant_stat_multipliers, EnchantResultKind,
    EnchantVisualGlow, ItemSocketState, SpecialAbility,
};
use server_rs::content::races::AtlasRace;
use server_rs::ecs::components::{
    DungeonPortalEventQueue, DungeonPortalTrigger, EntityId, Health, PlayerProgression, PlayerTag,
    Position,
};
use server_rs::fleet::{AgonesClient, DungeonRegistry, DungeonState, FleetLifecycle, FleetState};
use server_rs::net::WsServer;
use server_rs::storage::PrimaryStats;
use server_rs::systems::portal::dungeon_portal_trigger_system;

#[tokio::test]
async fn test_mmo_engine_full_e2e_multi_epic_pipeline() {
    println!("=== STEP 1: Multi-Race Character Roster & Primary 6-Stats ===");
    // 1. Player 1: Dwarf Blacksmith (Tontatta Micro-Titan)
    let dwarf_profile = AtlasRace::Dwarf.profile();
    assert_eq!(dwarf_profile.home_town_name, "Root-Train Roundhouse");
    let dwarf_stats = PrimaryStats {
        str: 85,
        agi: 40,
        int: 20,
        vit: 70,
        dex: 55,
        luk: 45,
    };
    let dwarf_derived = derived_stats_with_race(50, &dwarf_stats, None, Some(AtlasRace::Dwarf));
    assert!(dwarf_derived.p_atk > 100.0);
    assert!(dwarf_derived.aspd > 1.5);
    assert!(dwarf_derived.hit_rate > 150.0);

    // 2. Player 2: Ogre/Orc Vanguard Tank (Crucible Vanguard)
    let ogre_profile = AtlasRace::OgreOrc.profile();
    assert_eq!(ogre_profile.home_town_name, "Draft-Kiln Post");
    let ogre_stats = PrimaryStats {
        str: 70,
        agi: 30,
        int: 15,
        vit: 95,
        dex: 40,
        luk: 25,
    };
    let ogre_derived = derived_stats_with_race(50, &ogre_stats, None, Some(AtlasRace::OgreOrc));
    assert!(ogre_derived.max_health > 500.0);

    // 3. Player 3: Lunar High-Elven Wizard (Astral Starlight Weaver)
    let lunar_profile = AtlasRace::Lunar.profile();
    assert_eq!(lunar_profile.home_town_name, "Porcelain Loom Sanctuary");
    let lunar_stats = PrimaryStats {
        str: 20,
        agi: 50,
        int: 95,
        vit: 40,
        dex: 70,
        luk: 35,
    };
    let lunar_derived = derived_stats_with_race(
        50,
        &lunar_stats,
        Some("magic_staff"),
        Some(AtlasRace::Lunar),
    );
    assert!(lunar_derived.m_atk > 100.0);
    assert!(lunar_derived.cast_time_reduction_pct > 20.0);

    println!("=== STEP 2: High-Stakes +20 Enchanting & Card Socketing ===");
    // Dwarf enchants war hammer to +12 (Radiant Red glow)
    let hammer_enchant = attempt_high_tier_enchant(11, 0, true, false); // deterministic success
    assert_eq!(hammer_enchant.result, EnchantResultKind::Success);
    assert_eq!(hammer_enchant.new_tier, 12);
    assert_eq!(hammer_enchant.glow, EnchantVisualGlow::RadiantRed);

    let (hammer_p_mult, _, _) = compute_enchant_stat_multipliers(12);
    assert!(hammer_p_mult >= 1.85);

    // Socket Focus card (+15% Crit) into Dwarf's hammer
    let mut hammer_sockets = ItemSocketState::default();
    hammer_sockets.max_sockets = 4;
    hammer_sockets
        .socketed_card_ids
        .push("card_solaris_behemoth".to_string());
    hammer_sockets.special_ability = Some(SpecialAbility::Focus);
    assert_eq!(hammer_sockets.special_ability, Some(SpecialAbility::Focus));

    // Lunar Wizard enchants staff to +16 (Celestial Gold glow)
    let staff_enchant = attempt_high_tier_enchant(15, 0, true, false);
    assert_eq!(staff_enchant.result, EnchantResultKind::Success);
    assert_eq!(staff_enchant.new_tier, 16);
    assert_eq!(staff_enchant.glow, EnchantVisualGlow::CelestialGold);

    println!("=== STEP 3: Buff Containers & Song/Dance Separation ===");
    let mut buff_container = BuffContainer::default();
    // Add 1 Standard Buff (Vanguard Fortitude)
    let mut b1 = ActiveBuff::new(
        "buff_vanguard_fortitude",
        "Vanguard Fortitude",
        BuffCategory::Defensive,
        1200.0,
    );
    b1.p_def_mult = 1.20;
    assert!(buff_container.apply_buff(b1));

    // Add 1 Song/Dance Buff (Song of Earth)
    let mut b2 = ActiveBuff::new(
        "song_of_earth",
        "Song of Earth",
        BuffCategory::SongDance,
        300.0,
    );
    b2.p_def_mult = 1.15;
    assert!(buff_container.apply_buff(b2));

    assert_eq!(buff_container.buffs.len(), 2);
    let total_mult = buff_container.aggregate_multipliers();
    assert!(total_mult.p_def_mult > 1.35); // Stacks multiplicatively (1.20 * 1.15 = 1.38)

    println!("=== STEP 4: In-World Spatial Portal Trigger in Overworld ECS ===");
    let mut overworld = World::new();
    overworld.insert_resource(DungeonPortalEventQueue::default());

    // Spawn Spatial Portal at (200.0, 200.0) leading to Vesper Crater MVP
    overworld.spawn((
        Position::new(200.0, 200.0),
        DungeonPortalTrigger::new(
            "portal_vesper_crater_entrance",
            "dungeon_vesper_crater",
            "mvp_vesper_astral_weaver",
            20.0,
            40, // min level 40
        ),
    ));

    // Spawn Dwarf player at (205.0, 200.0) (within 20.0 trigger radius)
    overworld.spawn((
        PlayerTag,
        EntityId("player_dwarf_leader".to_string()),
        Position::new(205.0, 200.0),
        Health::new(100.0),
        PlayerProgression {
            level: 50,
            xp: 0,
            xp_to_next_level: 5000,
            total_xp: 50000,
        },
    ));

    let mut portal_schedule = Schedule::default();
    portal_schedule.add_systems(dungeon_portal_trigger_system);
    portal_schedule.run(&mut overworld);

    let portal_queue = overworld.resource::<DungeonPortalEventQueue>();
    assert_eq!(portal_queue.pending_entries.len(), 1);
    assert_eq!(
        portal_queue.pending_entries[0].player_id,
        "player_dwarf_leader"
    );
    assert_eq!(
        portal_queue.pending_entries[0].dungeon_template_id,
        "dungeon_vesper_crater"
    );

    println!("=== STEP 5: WebSocket Gateway, Agones Allocation & Room Migration ===");
    let auth = AuthGuard::new(b"mmo_engine_e2e_secret_token_32!".to_vec());
    let dungeons = Arc::new(DungeonRegistry::new());
    let agones = Arc::new(AgonesClient::new(None, false));
    agones.ready().await.expect("Agones ready failed");
    assert_eq!(agones.mock_state(), FleetState::Ready);

    let server = WsServer::bind("127.0.0.1:0", auth.clone())
        .await
        .expect("WsServer bind failed")
        .with_dungeons(dungeons.clone())
        .with_agones(agones.clone());
    let addr = server.local_addr();

    // Connect all 3 party members via WebSocket to overworld room map-for-play
    let dwarf_token = auth.issue_session_token("player_dwarf_leader", "DwarfLeader", 3600);
    let ogre_token = auth.issue_session_token("player_ogre_tank", "OgreTank", 3600);
    let lunar_token = auth.issue_session_token("player_lunar_mage", "LunarMage", 3600);

    let ws_url1 = format!("ws://{}/ws?token={}&map=map-for-play", addr, dwarf_token);
    let (ws1, _) = connect_async(&ws_url1).await.expect("ws1 connect failed");
    let (_w1, _r1) = ws1.split();

    let ws_url2 = format!("ws://{}/ws?token={}&map=map-for-play", addr, ogre_token);
    let (ws2, _) = connect_async(&ws_url2).await.expect("ws2 connect failed");
    let (_w2, _r2) = ws2.split();

    let ws_url3 = format!("ws://{}/ws?token={}&map=map-for-play", addr, lunar_token);
    let (ws3, _) = connect_async(&ws_url3).await.expect("ws3 connect failed");
    let (_w3, _r3) = ws3.split();

    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert_eq!(server.active_connections_in_room("map-for-play").await, 3);

    // Party enters the dungeon portal
    let party_id = "party_valkyrie_triad";
    let party_sessions = vec![
        "player_dwarf_leader".to_string(),
        "player_ogre_tank".to_string(),
        "player_lunar_mage".to_string(),
    ];

    let instance = server
        .handle_dungeon_portal_entry(
            party_id,
            "dungeon_vesper_crater",
            "mvp_vesper_astral_weaver",
            &party_sessions,
        )
        .await
        .expect("handle_dungeon_portal_entry failed");

    // Verify Agones transitioned to Allocated
    assert_eq!(agones.mock_state(), FleetState::Allocated);

    // Verify all 3 sockets migrated to the dungeon instance room
    let dungeon_room = &instance.instance_id;
    assert_eq!(server.active_connections_in_room("map-for-play").await, 0);
    assert_eq!(server.active_connections_in_room(dungeon_room).await, 3);

    println!("=== STEP 6: In-Dungeon Boss Encounter Simulation & MVP Distribution ===");
    let start_time = 1_700_000_000;
    // Re-allocate instance with explicit 100,000 HP boss and 300s enrage timer
    let dungeon_id = &instance.instance_id;
    dungeons.allocate_dungeon_with_boss(
        dungeon_id,
        party_id,
        "dungeon_vesper_crater",
        "mvp_vesper_astral_weaver",
        100_000,
        300,
        1800,
        start_time,
    );

    let http_client = Client::new();
    let dmg_endpoint = format!(
        "http://{}/dungeon/instance/{}/boss/damage",
        addr, dungeon_id
    );
    let tick_endpoint = format!("http://{}/dungeon/instance/{}/tick", addr, dungeon_id);

    // 1. Ogre Tank lands First Hit, takes 15,000 boss damage, deals 5,000 damage
    let resp1 = http_client
        .post(&dmg_endpoint)
        .json(&serde_json::json!({
            "playerId": "player_ogre_tank",
            "damage": 5_000,
            "damageTaken": 15_000,
            "nowSecs": start_time + 10
        }))
        .send()
        .await
        .expect("Tank damage request failed");
    assert_eq!(resp1.status(), 200);

    // 2. Lunar Mage deals 40,000 damage (100k - 5k - 40k = 55k remaining, Phase 1 Normal)
    let resp2 = http_client
        .post(&dmg_endpoint)
        .json(&serde_json::json!({
            "playerId": "player_lunar_mage",
            "damage": 40_000,
            "damageTaken": 1_000,
            "nowSecs": start_time + 20
        }))
        .send()
        .await
        .expect("Mage damage request failed");
    let body2: serde_json::Value = resp2.json().await.unwrap();
    assert_eq!(body2["encounter"]["currentHp"], 55_000);
    assert_eq!(body2["encounter"]["phase"], "phase1_normal");

    // 3. Dwarf Leader deals 10,000 damage (55k -> 45k, crosses 50% HP threshold!)
    let resp3 = http_client
        .post(&dmg_endpoint)
        .json(&serde_json::json!({
            "playerId": "player_dwarf_leader",
            "damage": 10_000,
            "damageTaken": 2_000,
            "nowSecs": start_time + 30
        }))
        .send()
        .await
        .expect("Dwarf damage request failed");
    let body3: serde_json::Value = resp3.json().await.unwrap();
    assert_eq!(body3["encounter"]["currentHp"], 45_000);
    assert_eq!(body3["encounter"]["phase"], "phase2_empowered");
    assert_eq!(body3["encounter"]["atkMultiplier"], 1.35);
    assert_eq!(body3["encounter"]["aspdMultiplier"], 1.25);
    assert!(body3["encounter"]["empoweredSkillUnlocked"]
        .as_bool()
        .unwrap());

    // 4. Tick timer past enrage (start_time + 305s > 300s)
    let resp_tick = http_client
        .post(&tick_endpoint)
        .json(&serde_json::json!({
            "nowSecs": start_time + 305
        }))
        .send()
        .await
        .expect("Enrage tick request failed");
    let body_tick: serde_json::Value = resp_tick.json().await.unwrap();
    assert_eq!(body_tick["instance"]["state"], "boss_enraged");

    // 5. Lunar Mage deals 20,000 damage to enraged boss (45k -> 25k)
    http_client
        .post(&dmg_endpoint)
        .json(&serde_json::json!({
            "playerId": "player_lunar_mage",
            "damage": 20_000,
            "damageTaken": 2_000,
            "nowSecs": start_time + 310
        }))
        .send()
        .await
        .expect("Mage second attack failed");

    // 6. Dwarf Leader lands Last Hit for 25,000 damage, slaying the MVP Boss!
    let resp_kill = http_client
        .post(&dmg_endpoint)
        .json(&serde_json::json!({
            "playerId": "player_dwarf_leader",
            "damage": 25_000,
            "damageTaken": 1_000,
            "nowSecs": start_time + 315
        }))
        .send()
        .await
        .expect("Killing blow request failed");
    let body_kill: serde_json::Value = resp_kill.json().await.unwrap();
    assert_eq!(body_kill["encounter"]["phase"], "defeated");
    assert_eq!(body_kill["encounter"]["currentHp"], 0);

    // 7. Verify RO/L2 Weighted MVP Scoring & Loot Distribution
    let mvp_rewards = body_kill["encounter"]["mvpRewards"].as_array().unwrap();
    assert_eq!(mvp_rewards.len(), 3);

    // Lunar Mage dealt 60,000 / 100,000 damage (60% dmg = 3600 pts) -> Wins MVP!
    let mvp_winner = &mvp_rewards[0];
    assert_eq!(mvp_winner["playerId"], "player_lunar_mage");
    assert!(mvp_winner["isMvpWinner"].as_bool().unwrap());
    assert_eq!(mvp_winner["rewardItemId"], "mvp_crown_of_victory");
    assert_eq!(mvp_winner["bonusExp"], 25_000);

    // Other participants receive dungeon chests
    for participant in &mvp_rewards[1..] {
        assert!(!participant["isMvpWinner"].as_bool().unwrap());
        assert_eq!(participant["rewardItemId"], "dungeon_participant_chest");
        assert_eq!(participant["bonusExp"], 8_000);
    }

    // Verify final dungeon state is Cleared
    let final_inst = dungeons.get_instance(dungeon_id).unwrap();
    assert_eq!(final_inst.state, DungeonState::Cleared);
    assert!(!final_inst.mvp_boss_alive);

    println!("=== SUCCESS: Full Multi-Epic E2E MMO Engine Pipeline Verified! ===");
}
