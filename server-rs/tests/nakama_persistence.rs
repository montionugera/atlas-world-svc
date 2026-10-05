use server_rs::content::derived_stats;
use server_rs::ecs::{
    CombatStats, ElementalAttributes, EntityId, Health, MobTag, PlayerAvatar, Position,
};
use server_rs::simulation::AtlasSimulation;
use server_rs::storage::{
    EquippedItemIds, LoadoutSnapshot, MatchEvent, MatchEventBatch, MockNakamaClient, PrimaryStats,
    ProfileDoc,
};

#[test]
fn test_derived_stats_parity_with_contracts() {
    // 1. Level 1 basic_sword anchor exact numerical verification
    let default_stats = PrimaryStats::default();
    let lvl1_sword = derived_stats(1, &default_stats, Some("basic_sword"));

    assert!((lvl1_sword.max_health - 110.0).abs() < 1e-4);
    assert!((lvl1_sword.p_atk - 22.0).abs() < 1e-4);
    assert_eq!(lvl1_sword.m_atk, 0.0);
    assert!((lvl1_sword.p_def - 6.0).abs() < 1e-4);
    assert!((lvl1_sword.m_def - 6.0).abs() < 1e-4);
    assert!((lvl1_sword.max_move_speed - 20.2).abs() < 1e-4);

    // 2. Archetype: Strength Warrior (Level 10, Str=35, Vit=25)
    let warrior_primary = PrimaryStats {
        str: 35,
        vit: 25,
        agi: 10,
        ..Default::default()
    };
    let lvl10_warrior = derived_stats(10, &warrior_primary, Some("basic_sword"));

    // Expected scaling: HP > 150, p_atk > 30, p_def > 8
    assert!(
        lvl10_warrior.max_health > 150.0,
        "Expected HP > 150.0, got {}",
        lvl10_warrior.max_health
    );
    assert!(
        lvl10_warrior.p_atk > 30.0,
        "Expected p_atk > 30.0, got {}",
        lvl10_warrior.p_atk
    );
    assert_eq!(lvl10_warrior.m_atk, 0.0);
    assert!(
        lvl10_warrior.p_def > 8.0,
        "Expected p_def > 8.0, got {}",
        lvl10_warrior.p_def
    );
    assert_eq!(lvl10_warrior.p_def, lvl10_warrior.m_def);
    assert_eq!(lvl10_warrior.max_move_speed, 22.0);

    // 3. Archetype: Intelligence Mage (Level 10, Int=40, Vit=15, apprentice_staff)
    let mage_primary = PrimaryStats {
        int: 40,
        vit: 15,
        ..Default::default()
    };
    let lvl10_mage = derived_stats(10, &mage_primary, Some("apprentice_staff"));

    assert_eq!(lvl10_mage.p_atk, 0.0);
    assert!(
        lvl10_mage.m_atk > 25.0,
        "Expected m_atk > 25.0, got {}",
        lvl10_mage.m_atk
    );
    assert!(lvl10_mage.max_health > 130.0);

    // 4. Archetype: Agility Rogue (Level 10, Agi=50, Vit=10)
    let rogue_primary = PrimaryStats {
        agi: 50,
        vit: 10,
        ..Default::default()
    };
    let lvl10_rogue = derived_stats(10, &rogue_primary, Some("basic_sword"));

    assert_eq!(lvl10_rogue.max_move_speed, 30.0);
}

#[tokio::test]
async fn test_nakama_client_mock_rpc() {
    let mock = MockNakamaClient::new();

    // 1. Session verification
    mock.set_session_user("valid_nakama_token", Some("user_nakama_42".to_string()));
    assert_eq!(
        mock.verify_session("valid_nakama_token").await.unwrap(),
        Some("user_nakama_42".to_string())
    );
    assert_eq!(
        mock.verify_session("invalid_nakama_token").await.unwrap(),
        None
    );

    // 2. Loadout retrieval
    let loadout = LoadoutSnapshot {
        profile: ProfileDoc {
            level: 15,
            allocated: PrimaryStats {
                str: 40,
                vit: 30,
                ..Default::default()
            },
            ..Default::default()
        },
        equipped_item_ids: EquippedItemIds {
            weapon: Some("steel_claymore".to_string()),
            ..Default::default()
        },
        skill_loadout: vec!["meteor_strike".to_string(), "blizzard".to_string()],
        ..Default::default()
    };
    mock.set_loadout("user_nakama_42", Some(loadout.clone()));

    let fetched = mock.get_loadout("user_nakama_42").await.unwrap();
    assert_eq!(fetched, Some(loadout));

    let missing = mock.get_loadout("user_nonexistent").await.unwrap();
    assert_eq!(missing, None);

    // 3. Match event reporting
    let batch = MatchEventBatch {
        user_id: "user_nakama_42".to_string(),
        events: vec![MatchEvent {
            event_type: "mob_kill".to_string(),
            target_id: "bramble_drake".to_string(),
            payload: serde_json::json!({ "mob_id": "bramble_drake" }),
        }],
    };

    let result = mock.report_match_events(&batch).await.unwrap();
    assert!(result.contains("deduped"));
    assert_eq!(mock.get_reported_batches().len(), 1);
    assert_eq!(mock.get_reported_batches()[0].user_id, "user_nakama_42");
    assert_eq!(mock.get_reported_batches()[0].events.len(), 1);
}

#[test]
fn test_spawn_player_with_persistent_loadout() {
    let mut sim = AtlasSimulation::new(0x42, 1000.0, 1000.0);

    // 1. Spawn player with custom Level 10 warrior loadout
    let loadout = LoadoutSnapshot {
        profile: ProfileDoc {
            level: 10,
            allocated: PrimaryStats {
                str: 35,
                vit: 25,
                agi: 15,
                ..Default::default()
            },
            ..Default::default()
        },
        equipped_item_ids: EquippedItemIds {
            weapon: Some("basic_sword".to_string()),
            ..Default::default()
        },
        ..Default::default()
    };

    let expected = derived_stats(10, &loadout.profile.allocated, Some("basic_sword"));
    assert!(expected.max_health > 150.0);
    assert!(expected.p_atk > 30.0);

    let session_id = "hero-warrior-10";
    let entity = sim.spawn_player_avatar_with_loadout(session_id, 350.0, 450.0, Some(&loadout));

    // Verify ECS component properties
    let health = sim.world.get::<Health>(entity).unwrap();
    assert_eq!(health.max, expected.max_health);
    assert_eq!(health.current, expected.max_health);
    assert!(health.is_alive);

    let combat = sim.world.get::<CombatStats>(entity).unwrap();
    assert_eq!(
        combat.attack_power,
        expected.p_atk.max(expected.m_atk).max(1.0)
    );
    assert_eq!(combat.defense, expected.p_def);
    assert!(combat.is_player);

    let elemental = sim.world.get::<ElementalAttributes>(entity).unwrap();
    assert_eq!(elemental.p_def, expected.p_def);
    assert_eq!(elemental.m_def, expected.m_def);

    let avatar = sim.world.get::<PlayerAvatar>(entity).unwrap();
    assert_eq!(avatar.session_id, session_id);
    assert_eq!(avatar.speed, expected.max_move_speed * 10.0);

    let pos = sim.world.get::<Position>(entity).unwrap();
    assert_eq!(pos.x, 350.0);
    assert_eq!(pos.y, 450.0);

    // 2. Spawn player with None falls back to Level 1 basic defaults
    let entity_default = sim.spawn_player_avatar("hero-rookie-1", 100.0, 100.0);
    let health_def = sim.world.get::<Health>(entity_default).unwrap();
    assert!((health_def.max - 110.0).abs() < 1e-4);
    let combat_def = sim.world.get::<CombatStats>(entity_default).unwrap();
    assert!((combat_def.attack_power - 22.0).abs() < 1e-4);
    assert!((combat_def.defense - 6.0).abs() < 1e-4);
}

#[test]
fn test_mob_kill_records_match_event() {
    let mut sim = AtlasSimulation::new(0x1337c0de, 1000.0, 1000.0);

    // Spawn player avatar
    let player_id = "player-slayer-99";
    let player_entity = sim.spawn_player_avatar(player_id, 500.0, 500.0);

    // Buff player attack to ensure single-hit kill and zero cooldown
    if let Some(mut combat) = sim.world.get_mut::<CombatStats>(player_entity) {
        combat.attack_power = 200.0;
        combat.attack_range = 60.0;
        combat.attack_cooldown = 0.05;
        combat.cooldown_timer = 0.0;
    }

    // Spawn target mob with 50 HP within attack range
    let mob_id = "veil_spearling_alpha";
    sim.world.spawn((
        EntityId(mob_id.to_string()),
        Position::new(520.0, 500.0),
        server_rs::ecs::Velocity::zero(),
        Health::new(50.0),
        MobTag,
        CombatStats {
            attack_power: 5.0,
            defense: 0.0,
            attack_range: 20.0,
            attack_cooldown: 1.0,
            cooldown_timer: 1.0,
            is_player: false,
        },
    ));

    // Step simulation: rebuilds spatial grid, processes combat system
    sim.step();

    // Drain recorded match events
    let events = sim.drain_match_events();
    assert_eq!(
        events.len(),
        1,
        "Expected 1 recorded match event, got {}",
        events.len()
    );

    let (user_id, event) = &events[0];
    assert_eq!(user_id, player_id);
    assert_eq!(event.event_type, "mob_kill");
    assert_eq!(event.target_id, mob_id);
    assert_eq!(event.payload["mob_id"], mob_id);

    // Second drain should be empty
    assert!(sim.drain_match_events().is_empty());
}
