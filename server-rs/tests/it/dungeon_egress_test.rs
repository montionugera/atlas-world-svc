use server_rs::fleet::dungeons::{DungeonEgressError, DungeonRegistry};

#[test]
fn test_dungeon_egress_blocked_before_boss_defeated() {
    let registry = DungeonRegistry::new();
    let _inst = registry.allocate_dungeon_with_boss(
        "dng_egress_1",
        "party_1",
        "millcross-spire",
        "boss_millcross",
        100_000,
        300,
        1800,
        1000,
    );

    // Instance is active; boss is alive
    let res = registry.trigger_dungeon_egress("dng_egress_1", "player_hero", false);
    assert_eq!(res, Err(DungeonEgressError::BossNotDefeated));
}

#[test]
fn test_dungeon_egress_blocked_while_in_combat() {
    let registry = DungeonRegistry::new();
    let _inst = registry.allocate_dungeon_with_boss(
        "dng_egress_2",
        "party_2",
        "millcross-spire",
        "boss_millcross",
        100_000,
        300,
        1800,
        1000,
    );

    // Defeat boss
    registry.record_boss_damage("dng_egress_2", "player_hero", 100_000, 500, 1005);

    // Player attempts egress while in combat
    let res = registry.trigger_dungeon_egress("dng_egress_2", "player_hero", true);
    assert_eq!(res, Err(DungeonEgressError::PlayerInCombat));
}

#[test]
fn test_dungeon_egress_routes_to_origin_and_handles_fallback() {
    let registry = DungeonRegistry::new();
    let _inst = registry.allocate_dungeon_with_boss(
        "dng_egress_3",
        "party_3",
        "millcross-spire",
        "boss_millcross",
        100_000,
        300,
        1800,
        1000,
    );

    // 1. With explicit origin
    registry.set_instance_origin("dng_egress_3", "c02/fluvial/overworld", 450.5, 320.0);
    registry.record_boss_damage("dng_egress_3", "player_hero", 100_000, 500, 1005);

    let egress = registry
        .trigger_dungeon_egress("dng_egress_3", "player_hero", false)
        .expect("Egress should succeed once boss is defeated and out of combat");

    assert_eq!(egress.region_id, "c02/fluvial/overworld");
    assert_eq!(egress.x, 450.5);
    assert_eq!(egress.y, 320.0);
    assert!(!egress.is_fallback);

    // 2. With fallback when origin is unset
    let _inst2 = registry.allocate_dungeon_with_boss(
        "dng_egress_4",
        "party_4",
        "millcross-spire",
        "boss_millcross",
        100_000,
        300,
        1800,
        1000,
    );
    registry.record_boss_damage("dng_egress_4", "player_hero", 100_000, 500, 1005);

    let fallback_egress = registry
        .trigger_dungeon_egress("dng_egress_4", "player_hero", false)
        .expect("Fallback egress should succeed");

    assert_eq!(fallback_egress.region_id, "millcross-ford");
    assert_eq!(fallback_egress.x, 100.0);
    assert_eq!(fallback_egress.y, 100.0);
    assert!(fallback_egress.is_fallback);
}
